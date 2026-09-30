-- UX Audit — Home & Explore, migration 0130: search also matches WHERE things are, below names.
--
-- Needs 0129 (search_norm, search_rank, search_pattern and the three functions recreated here).
--
-- Why: 0129 matched names only, so the "For you" city chip (search_for_you_terms → ('city',
-- 'Lisbon')) found only entities NAMED Lisbon — not an Americano at "Lisbon Padel Arena", nor a
-- club whose location is Lisbon.
--
-- Run the whole file as ONE script in the hosted SQL editor. It adds one index and REPLACES three
-- functions in place (same signatures, same result columns — no client change):
--
--   1. communities_location_trgm_idx   trigram GIN on search_norm(communities.location)
--   2. search_events       the query also matches the venue's name and address, and the event's
--                          own location text (manual_location_name, manual_location_address,
--                          location_text)
--   3. search_groups       the query also matches the parent community's location
--   4. search_communities  the query also matches communities.location
--
-- Ranking. A location match ranks STRICTLY below every name match: its rank is 5 + search_rank()
-- of the best-matching location field, so 5 exact, 6 prefix, 7 word prefix, 8 substring. Names
-- keep 0–3 and search_events' format match keeps 4. A row that matches on both takes the name rank.
-- Every other behaviour — visibility, blocks, filters, sorts, total_count, viewer_state, the
-- invalid_sort error — is 0129's, unchanged.
--
-- search_suggest is NOT recreated: it already keeps only rows whose LABEL (the entity name)
-- matches, so a row found through its location is dropped there and the typeahead stays
-- name-based. It never returns a venue or a place name. search_players is unchanged (profiles
-- have no public location to match).
--
-- Grants: re-closed the 0094 way (revoke public, anon, authenticated; grant authenticated). The
-- self-check at the bottom fails the script otherwise.

------------------------------------------------------------------------------
-- 1. Index
------------------------------------------------------------------------------
-- search_communities filters on `search_norm(location) like pattern` next to the name; with this
-- index next to 0129's communities_name_trgm_idx the planner can BitmapOr the two. Events are
-- matched through their computed rank (as in 0129), so no event/venue index would be used.
do $$
declare v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  execute format('create index if not exists communities_location_trgm_idx on public.communities
                  using gin (public.search_norm(location) %I.gin_trgm_ops)', v_schema);
end $$;

------------------------------------------------------------------------------
-- 2. search_events
------------------------------------------------------------------------------
-- 0129's contract, plus: rank 5–8 when the query matches only a location field — the venue's
-- name or address (a soft-deleted venue still counts: the event still shows it), or the event's
-- manual_location_name, manual_location_address or location_text.
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
                  then 4 end,
             -- least() skips nulls; 5 + null stays null (no location field matched).
             5 + least(search_rank(ve.name, p_q),
                       search_rank(ve.address, p_q),
                       search_rank(e.manual_location_name, p_q),
                       search_rank(e.manual_location_address, p_q),
                       search_rank(e.location_text, p_q))
           ) as rnk,
           e.id as eid
    from events e
    left join venues ve on ve.id = e.venue_id
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
-- 3. search_groups
------------------------------------------------------------------------------
-- 0129's contract, plus: rank 5–8 when the query matches only the parent community's location.
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
           coalesce(search_rank(g.name, p_q), 5 + search_rank(c.location, p_q)) as rnk
    from groups g
    join communities c on c.id = g.community_id
    join tenants t on t.id = c.tenant_id
    where g.archived_at is null
      and c.archived_at is null
      and (search_norm(g.name) like search_pattern(p_q)
           or search_norm(c.location) like search_pattern(p_q))
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
-- 4. search_communities
------------------------------------------------------------------------------
-- 0129's contract, plus: rank 5–8 when the query matches only communities.location.
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
           coalesce(search_rank(c.name, p_q), 5 + search_rank(c.location, p_q)) as rnk
    from communities c
    join tenants t on t.id = c.tenant_id
    where c.archived_at is null
      and (search_norm(c.name) like search_pattern(p_q)
           or search_norm(c.location) like search_pattern(p_q))
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
-- Self-check: grants still closed, the index exists, and the ranking offset holds.
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
    raise exception '0130: search RPC grants wrong (anon may call, or authenticated may not): %', v_open;
  end if;
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('search_events','search_groups','search_communities')) <> 3 then
    raise exception '0130: expected exactly one search_events, search_groups and search_communities';
  end if;
  if to_regclass('public.communities_location_trgm_idx') is null then
    raise exception '0130: communities_location_trgm_idx missing';
  end if;
  -- The worst name match (substring, 3) must still beat the best location match (exact, 5).
  if not (search_rank('xx lisbon xx', 'lisbon') < 5 + search_rank('Lisbon', 'lisbon')) then
    raise exception '0130: a location match would outrank a name match';
  end if;
end $$;
