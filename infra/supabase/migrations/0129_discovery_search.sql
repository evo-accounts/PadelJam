-- UX Audit — Home & Explore, migration 0129: server-side discovery search, suggestions, For-you terms.
--
-- Plan: docs/audit/2026-09-29-ux-home-explore-plan.md, "0129" (decisions D1, D2, D4, D6, D7, D8,
-- D9, D13; bug B3). Needs 0128 (communities.location_point).
--
-- Run the whole file as ONE script in the hosted SQL editor. It only ADDS objects (two extensions,
-- four indexes, nine functions); nothing existing is dropped or changed.
--
--   1. Matching: unaccent + pg_trgm, an immutable search_norm() wrapper, trigram GIN indexes.
--   2. search_players      (q, limit, offset)
--   3. search_events       (q, filters, sort, limit, offset)
--   4. search_groups       (q, filters, sort, limit, offset)
--   5. search_communities  (q, filters, sort, limit, offset)
--   6. search_suggest      (q, limit)              — typeahead (D7)
--   7. search_for_you_terms()                      — the "For you" chips (D6)
--
-- Shared contract of the four search_* RPCs:
--   * p_q is matched accent- and case-insensitively against the NAME. A blank or null p_q matches
--     everything, so the filters alone work (a filter sheet applied to an empty query).
--   * "relevant" ranks by match quality first — exact name, name prefix, word prefix, substring —
--     and then by the explore rail's own recommendation order (D13).
--   * total_count is a window count of every row that matched, before limit/offset (EXPL-07's
--     result count). It repeats on each row; an empty page means zero.
--   * viewer_state says where the viewer stands, so a card needs no query of its own (D9). Unlike
--     the explore rails, search INCLUDES what the viewer already has (D8): their communities,
--     groups and events come back with 'member' / an event role, and the card reads "Open".
--   * An unknown p_sort raises 'invalid_sort' rather than silently falling back.
--   * Distance: metres from the viewer's profile point. A row with no point (or a viewer with no
--     point) has distance_m null, sorts last on "distance", and is dropped by max_km (D2).
--
-- Grants: every function here is closed the 0094 way (revoke from public, anon, authenticated)
-- and re-granted to authenticated only. The self-check at the bottom fails the script otherwise.

------------------------------------------------------------------------------
-- 1. Matching
------------------------------------------------------------------------------
-- Both extensions ship with Supabase (hosted and the local CLI image) and are simply not enabled
-- yet. `with schema extensions` is Supabase's convention; if either is already installed in some
-- other schema, `if not exists` leaves it there, which is why everything below looks the schema up
-- instead of assuming it.
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- search_norm(text): lower(unaccent(text)). An index expression has to be IMMUTABLE and
-- unaccent(text) is only STABLE (it reads the dictionary through search_path), so this wrapper
-- calls the two-argument form with the dictionary named explicitly and pins search_path to ''.
-- Built with format() so the extension's actual schema is baked in.
--
-- It is granted to authenticated (not internal like viewer_distance_m) because it sits in the
-- index expressions below: Postgres checks EXECUTE on an index expression's functions for the
-- role doing the INSERT/UPDATE, and signed-in users update profiles.full_name and group names
-- directly. It is a pure string function; reaching it through /rpc exposes nothing.
do $$
declare v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'unaccent';

  execute format(
    $f$create or replace function public.search_norm(p text) returns text
       language sql immutable strict parallel safe set search_path = ''
       as $b$ select pg_catalog.lower(%1$I.unaccent(%2$L::regdictionary, p)) $b$ $f$,
    v_schema, v_schema || '.unaccent');
end $$;
revoke execute on function search_norm(text) from public, anon, authenticated;
grant  execute on function search_norm(text) to authenticated;

-- Match quality of a name against a query, lower is better:
--   0 exact (or a blank query, which matches everything), 1 name prefix, 2 word prefix,
--   3 substring, NULL no match.
-- The query's LIKE metacharacters are escaped so "50%" or "a_b" match literally.
create or replace function search_rank(p_name text, p_q text) returns int
language sql immutable parallel safe set search_path = public as $$
  with n as (
    select search_norm(coalesce(p_name, '')) as name,
           search_norm(btrim(coalesce(p_q, ''))) as q
  ), e as (
    select name, q, replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') as esc from n
  )
  select case
    when q = ''                        then 0
    when name = q                      then 0
    when name like esc || '%'          then 1
    when name like '% ' || esc || '%'  then 2
    when name like '%' || esc || '%'   then 3
  end
  from e;
$$;
revoke execute on function search_rank(text, text) from public, anon, authenticated;
grant  execute on function search_rank(text, text) to authenticated;

-- The LIKE pattern each search_* filters on ('%' when the query is blank). The WHERE clauses
-- write `search_norm(name) like search_pattern(q)` literally so the trigram index below applies;
-- search_rank only orders what that filter let through.
create or replace function search_pattern(p_q text) returns text
language sql immutable parallel safe set search_path = public as $$
  select '%' || replace(replace(replace(search_norm(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;
revoke execute on function search_pattern(text) from public, anon, authenticated;
grant  execute on function search_pattern(text) to authenticated;

-- Trigram GIN indexes, so '%q%' does not scan the table. The operator class lives in whatever
-- schema pg_trgm was installed into, hence the dynamic SQL.
do $$
declare v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  execute format('create index if not exists profiles_full_name_trgm_idx on public.profiles
                  using gin (public.search_norm(full_name) %I.gin_trgm_ops)', v_schema);
  execute format('create index if not exists events_name_trgm_idx on public.events
                  using gin (public.search_norm(name) %I.gin_trgm_ops) where deleted_at is null', v_schema);
  execute format('create index if not exists communities_name_trgm_idx on public.communities
                  using gin (public.search_norm(name) %I.gin_trgm_ops)', v_schema);
  execute format('create index if not exists groups_name_trgm_idx on public.groups
                  using gin (public.search_norm(name) %I.gin_trgm_ops)', v_schema);
end $$;

------------------------------------------------------------------------------
-- 2. search_players
------------------------------------------------------------------------------
-- Every onboarded, non-deleted profile except the viewer and anyone on either side of a block
-- (D8 — not only co-members, unlike explore_players). Blocks are symmetric (0102).
--   viewer_state: 'following' | 'none'.
--   Order: match rank, then name (accent-folded, so "Ágata" sorts with the A's).
create or replace function search_players(
  p_q      text,
  p_limit  int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  dominant_hand text,
  court_side text,
  viewer_state text,
  total_count bigint
)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, p.dominant_hand, p.court_side,
         case when exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = p.id)
              then 'following' else 'none' end as viewer_state,
         count(*) over () as total_count
  from profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.onboarded_at is not null
    and p.deleted_at is null
    and search_norm(p.full_name) like search_pattern(p_q)
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by search_rank(p.full_name, p_q), search_norm(p.full_name), p.id
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
revoke execute on function search_players(text, int, int) from public, anon, authenticated;
grant  execute on function search_players(text, int, int) to authenticated;

------------------------------------------------------------------------------
-- 3. search_events
------------------------------------------------------------------------------
-- Upcoming (scheduled, starts_at >= now()), non-deleted events the viewer can see:
--   (a) explore_events' visibility (0066): a public event of a public group whose community is
--       public or one the viewer's tenant membership covers — WITHOUT explore's exclusion of
--       events the viewer organizes or is on the roster of (D8: search finds everything visible);
--   (b) plus any event the viewer organizes or holds a roster row on (confirmed, waiting list,
--       interested, invited), private or not. That is exactly what the event screen already lets
--       them open, and a private event is otherwise unfindable for its own players.
--
-- Matching: the event name, or — rank 4, after every name match — the format, so the For-you
-- chip 'americano' (section 7) finds Americanos that do not say so in their name. The format
-- match is a prefix match on the machine value with '_' read as a space ('up and down').
--
-- Filters (p_filters, all optional; an absent key, null or empty array is "no filter"):
--   date_from  'YYYY-MM-DD' or an ISO timestamp. starts_at >= it (a bare date is 00:00 UTC).
--   date_to    'YYYY-MM-DD' (the WHOLE day, UTC: starts_at < the next midnight) or an ISO
--              timestamp (starts_at <= it). Clients with a local-day picker should send ISO
--              timestamps with their offset.
--   types      array of 'event_type:specification' strings or {event_type, specification}
--              objects — the nine chips (D4). A bare 'americano' matches every specification.
--   max_km     number. distance_m <= max_km * 1000; a row without distance never matches.
--   free       true → entrance fee disabled, or amount null / 0 (D13). false = no filter.
--   recurring  true → series_id is not null (D13). false = no filter.
-- Sort: 'relevant' (rank, distance nulls last, starts_at) | 'date' (starts_at, rank) |
--       'distance' (distance nulls last, starts_at).
--
-- Returns the whole events row as `event` (the explore_events shape, so cards reuse the events
-- Row type), distance_m, viewer_state and total_count.
--   viewer_state: 'organizer' | 'confirmed' | 'waiting_list' | 'interested' | 'invited' | 'none'.
create or replace function search_events(
  p_q       text,
  p_filters jsonb default '{}'::jsonb,
  p_sort    text  default 'relevant',
  p_limit   int   default 20,
  p_offset  int   default 0
)
returns table (
  event events,
  distance_m double precision,
  viewer_state text,
  total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_point geography;
  v_f     jsonb := coalesce(p_filters, '{}'::jsonb);
  v_sort  text := coalesce(p_sort, 'relevant');
  v_from  timestamptz;
  v_to    timestamptz;
  v_to_excl boolean := false;
  v_types text[];
  v_max_m double precision;
  v_free  boolean := coalesce((v_f->>'free')::boolean, false);
  v_rec   boolean := coalesce((v_f->>'recurring')::boolean, false);
  v_fmt   text := search_norm(btrim(coalesce(p_q, '')));
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_sort not in ('relevant', 'date', 'distance') then
    raise exception 'invalid_sort' using errcode = 'P0001';
  end if;

  select location_point into v_point from profiles where id = v_uid;

  if nullif(v_f->>'date_from', '') is not null then
    v_from := (v_f->>'date_from')::timestamptz;
  end if;
  if nullif(v_f->>'date_to', '') is not null then
    if (v_f->>'date_to') ~ '^\d{4}-\d{2}-\d{2}$' then
      v_to := ((v_f->>'date_to')::date + 1)::timestamptz;
      v_to_excl := true;
    else
      v_to := (v_f->>'date_to')::timestamptz;
    end if;
  end if;
  if jsonb_typeof(v_f->'types') = 'array' and jsonb_array_length(v_f->'types') > 0 then
    v_types := array(
      select case jsonb_typeof(x)
               when 'object' then concat_ws(':', x->>'event_type', nullif(x->>'specification', ''))
               else x #>> '{}'
             end
      from jsonb_array_elements(v_f->'types') x
    );
  end if;
  if jsonb_typeof(v_f->'max_km') = 'number' then
    v_max_m := (v_f->>'max_km')::double precision * 1000;
  end if;

  return query
  with visible as (
    select e as ev,
           e.starts_at,
           st_distance(v_point, e.location_point) as dist,
           case
             when e.organizer_id = v_uid then 'organizer'
             else coalesce((select ep.status from event_participants ep
                            where ep.event_id = e.id and ep.user_id = v_uid
                            order by case ep.status when 'confirmed' then 0 when 'waiting_list' then 1
                                                    when 'interested' then 2 else 3 end
                            limit 1), 'none')
           end as vstate,
           coalesce(
             search_rank(e.name, p_q),
             case when v_fmt <> '' and replace(e.event_type, '_', ' ') like
                         replace(replace(replace(v_fmt, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                  then 4 end
           ) as rnk,
           e.id as eid
    from events e
    left join groups g on g.id = e.group_id
    left join communities c on c.id = g.community_id
    where e.deleted_at is null
      and e.status = 'scheduled'
      and e.starts_at >= now()
      and (
        (    e.is_private = false
         and e.group_id is not null
         and g.archived_at is null
         and c.archived_at is null
         and g.is_private = false
         and (c.privacy = 'public'
              or c.tenant_id in (select tm.tenant_id from tenant_memberships tm where tm.user_id = v_uid)))
        or e.organizer_id = v_uid
        or exists (select 1 from event_participants ep where ep.event_id = e.id and ep.user_id = v_uid)
      )
      and (v_from is null or e.starts_at >= v_from)
      and (v_to is null or (case when v_to_excl then e.starts_at < v_to else e.starts_at <= v_to end))
      and (v_types is null
           or e.event_type || ':' || e.specification = any (v_types)
           or e.event_type = any (v_types))
      and (not v_free or e.entrance_fee_enabled = false or coalesce(e.entrance_fee_amount, 0) = 0)
      and (not v_rec or e.series_id is not null)
  )
  select v.ev, v.dist, v.vstate, count(*) over ()
  from visible v
  where v.rnk is not null
    and (v_max_m is null or v.dist <= v_max_m)
  order by
    case when v_sort = 'relevant' then v.rnk end asc,
    case when v_sort in ('relevant', 'distance') then v.dist end asc nulls last,
    v.starts_at asc,
    case when v_sort = 'date' then v.rnk end asc,
    v.eid
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
end;
$$;
revoke execute on function search_events(text, jsonb, text, int, int) from public, anon, authenticated;
grant  execute on function search_events(text, jsonb, text, int, int) to authenticated;

------------------------------------------------------------------------------
-- 4. search_groups
------------------------------------------------------------------------------
-- explore_groups' visibility (a public group of a live community that is public or that the
-- viewer's tenant membership covers), PLUS every live group the viewer is a member of, private
-- ones included (D1, D8). A private group the viewer is not in never appears. There is no
-- privacy filter (D1).
--
-- Filters (p_filters, all optional):
--   community_ids  uuid[]. Restricted to communities the viewer is a member of (D13): an id of any
--                  other community is ignored, it can never widen or match anything. A list of
--                  only such ids therefore returns nothing.
--   max_km         number, measured to the parent community's point (D2).
--   with_upcoming  true → the group has at least one upcoming visible event: scheduled, not
--                  deleted, starts_at >= now(), and not private.
-- Sort: 'relevant' (rank, then explore_groups' order: my communities first, same country,
--       nearest, newest) | 'recent' (created_at desc) | 'distance' (nulls last, then rank).
--   viewer_state: 'member' | 'none'.
create or replace function search_groups(
  p_q       text,
  p_filters jsonb default '{}'::jsonb,
  p_sort    text  default 'relevant',
  p_limit   int   default 20,
  p_offset  int   default 0
)
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  name text,
  is_general boolean,
  is_private boolean,
  archived_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  description text,
  thumbnail_path text,
  updated_at timestamptz,
  member_count int,
  distance_m double precision,
  viewer_state text,
  total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_point geography;
  v_f     jsonb := coalesce(p_filters, '{}'::jsonb);
  v_sort  text := coalesce(p_sort, 'relevant');
  v_cids  uuid[];
  v_max_m double precision;
  v_up    boolean := coalesce((v_f->>'with_upcoming')::boolean, false);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_sort not in ('relevant', 'recent', 'distance') then
    raise exception 'invalid_sort' using errcode = 'P0001';
  end if;

  select location_point into v_point from profiles where id = v_uid;

  if jsonb_typeof(v_f->'community_ids') = 'array' and jsonb_array_length(v_f->'community_ids') > 0 then
    v_cids := array(
      select (x #>> '{}')::uuid from jsonb_array_elements(v_f->'community_ids') x
      intersect
      select cm.community_id from community_members cm where cm.user_id = v_uid
    );
  end if;
  if jsonb_typeof(v_f->'max_km') = 'number' then
    v_max_m := (v_f->>'max_km')::double precision * 1000;
  end if;

  return query
  with visible as (
    select g.id as gid, g.community_id as cid, c.name as cname, g.name as gname, g.is_general as gen,
           g.is_private as priv, g.archived_at as arch, g.created_at as created, g.created_by as creator,
           g.description as descr, g.thumbnail_path as thumb, g.updated_at as updated,
           st_distance(v_point, c.location_point) as dist,
           exists (select 1 from group_members gm where gm.group_id = g.id and gm.user_id = v_uid) as is_member,
           exists (select 1 from community_members cm where cm.community_id = c.id and cm.user_id = v_uid) as in_community,
           (t.country = any (
              select tt.country from tenant_memberships tm
              join tenants tt on tt.id = tm.tenant_id where tm.user_id = v_uid)) as same_country,
           search_rank(g.name, p_q) as rnk
    from groups g
    join communities c on c.id = g.community_id
    join tenants t on t.id = c.tenant_id
    where g.archived_at is null
      and c.archived_at is null
      and search_norm(g.name) like search_pattern(p_q)
      and (
        (    g.is_private = false
         and (c.privacy = 'public'
              or c.tenant_id in (select tm.tenant_id from tenant_memberships tm where tm.user_id = v_uid)))
        or exists (select 1 from group_members gm where gm.group_id = g.id and gm.user_id = v_uid)
      )
      and (v_cids is null or g.community_id = any (v_cids))
      and (not v_up or exists (
        select 1 from events e
        where e.group_id = g.id and e.deleted_at is null and e.status = 'scheduled'
          and e.starts_at >= now() and e.is_private = false))
  )
  select v.gid, v.cid, v.cname, v.gname, v.gen, v.priv, v.arch, v.created, v.creator, v.descr,
         v.thumb, v.updated,
         (select count(*)::int from group_members gm where gm.group_id = v.gid),
         v.dist,
         case when v.is_member then 'member' else 'none' end,
         count(*) over ()
  from visible v
  where (v_max_m is null or v.dist <= v_max_m)
  order by
    case when v_sort = 'relevant' then v.rnk end asc,
    case when v_sort = 'distance' then v.dist end asc nulls last,
    case when v_sort = 'recent' then v.created end desc,
    case when v_sort = 'distance' then v.rnk end asc,
    v.in_community desc,
    v.same_country desc nulls last,
    v.dist asc nulls last,
    v.created desc,
    v.gid
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
end;
$$;
revoke execute on function search_groups(text, jsonb, text, int, int) from public, anon, authenticated;
grant  execute on function search_groups(text, jsonb, text, int, int) to authenticated;

------------------------------------------------------------------------------
-- 5. search_communities
------------------------------------------------------------------------------
-- Live communities that are public or request_to_join (explore_communities' visibility, without
-- its member / pending-request exclusions — D8), PLUS private communities the viewer is a member
-- of. A private community the viewer is not in never appears.
--
-- Filters (p_filters, all optional):
--   types          text[] of 'club' | 'team' | 'friends'.
--   max_km         number, measured to the community's point (D2).
--   privacy        text[] of 'public' | 'request_to_join' | 'private'. 'private' can only ever
--                  match the viewer's own private communities, because nothing else is visible.
--   with_upcoming  true → at least one upcoming visible event in any of its groups: scheduled,
--                  not deleted, starts_at >= now(), not private, in a group that is not private.
-- Sort: 'relevant' (rank, then explore_communities' order: same country, nearest, newest) |
--       'recent' (created_at desc) | 'distance' (nulls last, then rank).
-- Columns: explore_communities' (0128) + member_count + total_count.
--   viewer_state: 'member' | 'requested' | 'invited' | 'none'.
create or replace function search_communities(
  p_q       text,
  p_filters jsonb default '{}'::jsonb,
  p_sort    text  default 'relevant',
  p_limit   int   default 20,
  p_offset  int   default 0
)
returns table (
  id uuid,
  tenant_id uuid,
  name text,
  description text,
  type text,
  privacy text,
  archived_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  location text,
  thumbnail_path text,
  cover_image_path text,
  cancellation_rules_enabled boolean,
  cancellation_rules_text text,
  updated_at timestamptz,
  member_count int,
  distance_m double precision,
  viewer_state text,
  total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid     uuid := auth.uid();
  v_point   geography;
  v_f       jsonb := coalesce(p_filters, '{}'::jsonb);
  v_sort    text := coalesce(p_sort, 'relevant');
  v_types   text[];
  v_privacy text[];
  v_max_m   double precision;
  v_up      boolean := coalesce((v_f->>'with_upcoming')::boolean, false);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_sort not in ('relevant', 'recent', 'distance') then
    raise exception 'invalid_sort' using errcode = 'P0001';
  end if;

  select location_point into v_point from profiles where id = v_uid;

  if jsonb_typeof(v_f->'types') = 'array' and jsonb_array_length(v_f->'types') > 0 then
    v_types := array(select jsonb_array_elements_text(v_f->'types'));
  end if;
  if jsonb_typeof(v_f->'privacy') = 'array' and jsonb_array_length(v_f->'privacy') > 0 then
    v_privacy := array(select jsonb_array_elements_text(v_f->'privacy'));
  end if;
  if jsonb_typeof(v_f->'max_km') = 'number' then
    v_max_m := (v_f->>'max_km')::double precision * 1000;
  end if;

  return query
  with visible as (
    select c.*,
           st_distance(v_point, c.location_point) as dist,
           exists (select 1 from community_members cm where cm.community_id = c.id and cm.user_id = v_uid) as is_member,
           (t.country = any (
              select tt.country from tenant_memberships tm
              join tenants tt on tt.id = tm.tenant_id where tm.user_id = v_uid)) as same_country,
           search_rank(c.name, p_q) as rnk
    from communities c
    join tenants t on t.id = c.tenant_id
    where c.archived_at is null
      and search_norm(c.name) like search_pattern(p_q)
      and (
        c.privacy in ('public', 'request_to_join')
        or exists (select 1 from community_members cm where cm.community_id = c.id and cm.user_id = v_uid)
      )
      and (v_types is null or c.type = any (v_types))
      and (v_privacy is null or c.privacy = any (v_privacy))
      and (not v_up or exists (
        select 1 from events e join groups g on g.id = e.group_id
        where g.community_id = c.id and e.deleted_at is null and e.status = 'scheduled'
          and e.starts_at >= now() and e.is_private = false and g.is_private = false))
  )
  select v.id, v.tenant_id, v.name, v.description, v.type, v.privacy, v.archived_at, v.created_at,
         v.created_by, v.location, v.thumbnail_path, v.cover_image_path,
         v.cancellation_rules_enabled, v.cancellation_rules_text, v.updated_at,
         (select count(*)::int from community_members cm where cm.community_id = v.id),
         v.dist,
         case
           when v.is_member then 'member'
           when exists (select 1 from community_join_requests r
                        where r.community_id = v.id and r.user_id = v_uid and r.status = 'pending') then 'requested'
           when exists (select 1 from community_invitations i
                        where i.community_id = v.id and i.invitee_id = v_uid and i.status = 'pending') then 'invited'
           else 'none'
         end,
         count(*) over ()
  from visible v
  where (v_max_m is null or v.dist <= v_max_m)
  order by
    case when v_sort = 'relevant' then v.rnk end asc,
    case when v_sort = 'distance' then v.dist end asc nulls last,
    case when v_sort = 'recent' then v.created_at end desc,
    case when v_sort = 'distance' then v.rnk end asc,
    v.same_country desc nulls last,
    v.dist asc nulls last,
    v.created_at desc,
    v.id
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
end;
$$;
revoke execute on function search_communities(text, jsonb, text, int, int) from public, anon, authenticated;
grant  execute on function search_communities(text, jsonb, text, int, int) to authenticated;

------------------------------------------------------------------------------
-- 6. search_suggest (D7)
------------------------------------------------------------------------------
-- Typeahead: up to p_limit (default 8, max 20) entity names across players, events, communities
-- and groups — exactly what the four search RPCs would find for the viewer, because it asks
-- them. Order: prefix matches first (exact, name prefix, word prefix), then substrings; ties go
-- players, events, communities, groups, then alphabetically. Accent- and case-insensitive.
-- A blank query returns nothing (the empty-query state shows For you and Recent instead).
-- Events matched only on their format (search_events' rank 4) are left out: the label would not
-- contain what was typed.
--   kind: 'player' | 'event' | 'community' | 'group'.
create or replace function search_suggest(p_q text, p_limit int default 8)
returns table (kind text, id uuid, label text)
language sql stable security definer set search_path = public as $$
  with lim as (select least(greatest(coalesce(p_limit, 8), 0), 20) as n),
  hits as (
    select 'player'::text as kind, 1 as k, p.id, p.full_name as label
    from search_players(p_q, (select n from lim), 0) p
    union all
    select 'event', 2, (e.event).id, (e.event).name
    from search_events(p_q, '{}'::jsonb, 'relevant', (select n from lim), 0) e
    union all
    select 'community', 3, c.id, c.name
    from search_communities(p_q, '{}'::jsonb, 'relevant', (select n from lim), 0) c
    union all
    select 'group', 4, g.id, g.name
    from search_groups(p_q, '{}'::jsonb, 'relevant', (select n from lim), 0) g
  )
  select h.kind, h.id, h.label
  from hits h
  where btrim(coalesce(p_q, '')) <> ''
    and search_rank(h.label, p_q) is not null
  order by search_rank(h.label, p_q), h.k, search_norm(h.label), h.id
  limit (select n from lim);
$$;
revoke execute on function search_suggest(text, int) from public, anon, authenticated;
grant  execute on function search_suggest(text, int) to authenticated;

------------------------------------------------------------------------------
-- 7. search_for_you_terms (D6)
------------------------------------------------------------------------------
-- The "For you" chips on the empty query, up to 8 rows of (kind, value), in this order:
--   ('city', …)       the first comma-separated part of the viewer's profiles.location_text
--                     ("Lisbon, PT" → "Lisbon"). At most one.
--   ('format', …)     machine event_type values — 'americano' | 'mexicano' | 'up_and_down' — of
--                     upcoming events the viewer can find (search_events' visibility) within
--                     50 km, most frequent first. At most three. The CLIENT localizes the label;
--                     tapping it can run the localized word as a query (search_events matches a
--                     format word) or open the Events tab with a types filter. A viewer with no
--                     profile point gets formats from every visible upcoming event instead.
--   ('community', …)  names of the top explore_communities recommendations (not a member, no
--                     pending request). At most four.
-- Nothing qualifies → no rows, and the client hides the block.
create or replace function search_for_you_terms()
returns table (kind text, value text)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.location_text, p.location_point from profiles p where p.id = auth.uid()
  ),
  city as (
    select 'city'::text as kind, nullif(btrim(split_part(me.location_text, ',', 1)), '') as value,
           1 as k, 0 as ord
    from me
  ),
  formats as (
    select 'format'::text as kind, (s.event).event_type as value, 2 as k,
           row_number() over (order by count(*) desc, (s.event).event_type) as ord
    from search_events(
      null,
      case when (select location_point from me) is not null
           then jsonb_build_object('max_km', 50) else '{}'::jsonb end,
      'date', 200, 0) s
    group by (s.event).event_type
  ),
  comms as (
    select 'community'::text as kind, c.name as value, 3 as k, c.ordinality as ord
    from explore_communities(4, 0) with ordinality as c
  ),
  terms as (
    select * from city where value is not null
    union all select * from formats where ord <= 3
    union all select * from comms
  )
  select t.kind, t.value from terms t
  where auth.uid() is not null
  order by t.k, t.ord
  limit 8;
$$;
revoke execute on function search_for_you_terms() from public, anon, authenticated;
grant  execute on function search_for_you_terms() to authenticated;

------------------------------------------------------------------------------
-- Self-check: every function above is signed-in only, and the extensions are in place.
------------------------------------------------------------------------------
do $$
declare v_open text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_open
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('search_norm','search_rank','search_pattern','search_players','search_events',
                      'search_groups','search_communities','search_suggest','search_for_you_terms')
    and (has_function_privilege('anon', p.oid, 'execute')
         or not has_function_privilege('authenticated', p.oid, 'execute'));
  if v_open is not null then
    raise exception '0129: search RPC grants wrong (anon may call, or authenticated may not): %', v_open;
  end if;
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('search_norm','search_rank','search_pattern','search_players','search_events',
                          'search_groups','search_communities','search_suggest','search_for_you_terms')) <> 9 then
    raise exception '0129: expected nine search functions';
  end if;
  if search_norm('Ábç ÉÇÃO') <> 'abc ecao' then
    raise exception '0129: search_norm is not accent-insensitive';
  end if;
end $$;
