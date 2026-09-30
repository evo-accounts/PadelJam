-- UX Audit — Home & Explore, migration 0128: explore viewer state, follow RPCs, community geo.
--
-- Plan: docs/audit/2026-09-29-ux-home-explore-plan.md, "0128" (decisions D2, D8, D9; bug B4).
--
-- Run the whole file as ONE script in the hosted SQL editor: three explore functions and the
-- community create RPC are DROPPED and recreated below, and a partial run leaves the app without
-- them.
--
--   1. communities.location_point (D2), written by the create RPC and by set_community_location.
--   2. explore_players   + viewer_state; the rail no longer offers people you already follow (D8).
--   3. explore_communities + viewer_state + distance_m; the rail no longer offers communities you
--      have a pending request to (B4).
--   4. explore_groups    + viewer_state + distance_m (through the parent community's point).
--   5. follow_player / unfollow_player, returning the new state (D9).
--
-- explore_events keeps its body. Its rail already excludes every event the viewer organizes or has
-- any roster row on, so a viewer_state column would read 'none' on every row it can return. Only
-- its grants change (section 6).
--
-- Grants: all four discovery RPCs are signed-in only. `create function` gives PUBLIC execute, and
-- 0030's default privileges add anon explicitly, so a bare `grant ... to authenticated` left these
-- security definer functions callable by anon — explore_communities listed public communities to
-- anyone with the publishable key. Each is closed the 0094 way, then re-granted to authenticated.

------------------------------------------------------------------------------
-- 1. Communities get a geo point (D2)
------------------------------------------------------------------------------
-- `location` keeps the picked place's label; `location_point` is its coordinates. No backfill:
-- existing communities get a point the next time an admin saves the location. Without one, a
-- community sorts after every community that has one wherever distance ranks.
alter table communities add column if not exists location_point geography(point);

-- The point is built server-side so no client hand-encodes WKT/SRID (the set_my_location pattern,
-- 0054). Overwrites the label AND the point as a pair; null coordinates clear the point and keep
-- the label (a place that could not be geocoded). Admin-only, like the `communities: update`
-- policy it sits beside.
create or replace function set_community_location(
  p_community_id uuid,
  p_lat          double precision,
  p_lng          double precision,
  p_location     text
)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from communities where id = p_community_id) then
    raise exception 'community_not_found' using errcode = 'P0001';
  end if;
  if not is_community_admin(p_community_id) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;

  update communities
     set location = p_location,
         location_point = case
           when p_lat is null then null
           else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography   -- (longitude, latitude)
         end
   where id = p_community_id;
end;
$$;
revoke execute on function set_community_location(uuid, double precision, double precision, text)
  from public, anon, authenticated;
grant execute on function set_community_location(uuid, double precision, double precision, text)
  to authenticated;

-- Create takes the point too. 0107's body, with two trailing optional parameters. DROP and
-- recreate rather than overload: two functions differing only in defaulted trailing arguments make
-- every named call ambiguous to PostgREST. Callers that omit the new arguments are unaffected.
drop function if exists create_community_with_personal_tenant(
  text, text, text, text, text, text, text, text, boolean, text);

create function create_community_with_personal_tenant(
  p_name        text,
  p_type        text,
  p_country     text,
  p_privacy     text default 'public',
  p_description text default null,
  p_location    text default null,
  p_thumbnail_path   text default null,
  p_cover_image_path text default null,
  p_cancellation_rules_enabled boolean default false,
  p_cancellation_rules_text    text default null,
  p_location_lat double precision default null,
  p_location_lng double precision default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid; v_community uuid; v_group uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not can_create_community() then
    raise exception 'owned_community_cap_reached' using errcode = 'P0001';
  end if;
  if (p_location_lat is null) <> (p_location_lng is null)
     or p_location_lat not between -90 and 90
     or p_location_lng not between -180 and 180 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;

  insert into tenants (type, name, country, is_personal, owner_id)
    values ('community', p_name, p_country, true, v_user) returning id into v_tenant;
  insert into tenant_memberships (user_id, tenant_id, role)
    values (v_user, v_tenant, 'community_owner');

  insert into communities (tenant_id, created_by, name, description, type, privacy, location,
                           location_point,
                           thumbnail_path, cover_image_path,
                           cancellation_rules_enabled, cancellation_rules_text)
    values (v_tenant, v_user, p_name, p_description, p_type, p_privacy, p_location,
            case when p_location_lat is null then null
                 else st_setsrid(st_makepoint(p_location_lng, p_location_lat), 4326)::geography end,
            p_thumbnail_path, p_cover_image_path,
            p_cancellation_rules_enabled, p_cancellation_rules_text)
    returning id into v_community;

  -- UX-COMM-17's defaults, spelled out rather than left to the column defaults so the matrix is
  -- readable at the one place a community is born.
  insert into community_permissions (community_id, create_posts, create_events, invite_members,
                                     create_groups, approve_join_requests)
    values (v_community, true, true, true, false, false);
  -- The creator is an admin; the co-organizer cap allows the first one on every tier (0098).
  -- They wrote the rules, so creating the community IS their acceptance — and when there are no
  -- rules there is nothing to accept, which is the column's NULL.
  insert into community_members (community_id, user_id, role, rules_accepted_at)
    values (v_community, v_user, 'admin',
            case when coalesce(p_cancellation_rules_enabled, false) then now() end);
  -- General group named "<name> Group" (UX-GRP-01); Starter stays implicit (no community_subscriptions row).
  insert into groups (community_id, created_by, name, is_general)
    values (v_community, v_user, p_name || ' Group', true) returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, v_user);
  insert into group_seasons (group_id, season_number) values (v_group, 1);

  return v_community;
end;
$$;
revoke execute on function create_community_with_personal_tenant(
  text, text, text, text, text, text, text, text, boolean, text, double precision, double precision)
  from public, anon, authenticated;
grant execute on function create_community_with_personal_tenant(
  text, text, text, text, text, text, text, text, boolean, text, double precision, double precision)
  to authenticated;

------------------------------------------------------------------------------
-- 2. explore_players: viewer_state, and followed people leave the rail (D8)
------------------------------------------------------------------------------
-- 0102's body with a followed-player exclusion and a viewer_state column. Because the rail
-- excludes everyone the viewer follows, viewer_state reads 'none' on every row it returns today;
-- the column is there so every explore and search RPC hands cards the same contract (D9), and
-- 'following' is what a card flips to after follow_player.
-- Blocks stay symmetric (0102).
drop function if exists explore_players(int, int);
create function explore_players(p_limit int default 10, p_offset int default 0)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  dominant_hand text,
  court_side text,
  shared_count int,
  viewer_state text
)
language sql stable security definer set search_path = public as $$
  with candidates as (
    select cm.user_id as uid, count(*)::int as shared
    from community_members cm
    where cm.community_id in (
        select community_id from community_members where user_id = auth.uid()
      )
      and cm.user_id <> auth.uid()
    group by cm.user_id
    union all
    select gm.user_id as uid, count(*)::int as shared
    from group_members gm
    where gm.group_id in (
        select group_id from group_members where user_id = auth.uid()
      )
      and gm.user_id <> auth.uid()
    group by gm.user_id
  ),
  agg as (
    select uid, sum(shared)::int as shared_count
    from candidates
    group by uid
  )
  select p.id, p.full_name, p.avatar_url, p.dominant_hand, p.court_side, a.shared_count,
         case when exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = p.id)
              then 'following' else 'none' end as viewer_state
  from agg a
  join profiles p on p.id = a.uid
  where not exists (
    select 1 from blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
       or (b.blocker_id = p.id and b.blocked_id = auth.uid())
  )
    and not exists (
      select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = p.id
    )
  order by a.shared_count desc, p.created_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
revoke execute on function explore_players(int, int) from public, anon, authenticated;
grant execute on function explore_players(int, int) to authenticated;

------------------------------------------------------------------------------
-- 3. explore_communities: viewer_state + distance_m; pending requests leave the rail (B4)
------------------------------------------------------------------------------
-- 0052's filter plus a pending-request exclusion. An explicit column list replaces `setof
-- communities`: it adds the two computed columns and keeps the raw geography out of the payload
-- (distance_m is what a card shows).
--   viewer_state: 'member' | 'requested' | 'invited' | 'none'. The rail excludes members and
--   pending requests, so only 'invited' and 'none' reach it; the full set is the contract search
--   (0129) shares.
--   Ranking: same country first (0052), then nearest (no point → last), then newest.
drop function if exists explore_communities(int, int);
create function explore_communities(p_limit int default 10, p_offset int default 0)
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
  distance_m double precision,
  viewer_state text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.tenant_id, c.name, c.description, c.type, c.privacy, c.archived_at, c.created_at,
         c.created_by, c.location, c.thumbnail_path, c.cover_image_path,
         c.cancellation_rules_enabled, c.cancellation_rules_text, c.updated_at,
         viewer_distance_m(c.location_point) as distance_m,
         case
           when exists (select 1 from community_members cm
                        where cm.community_id = c.id and cm.user_id = auth.uid()) then 'member'
           when exists (select 1 from community_join_requests r
                        where r.community_id = c.id and r.user_id = auth.uid()
                          and r.status = 'pending') then 'requested'
           when exists (select 1 from community_invitations i
                        where i.community_id = c.id and i.invitee_id = auth.uid()
                          and i.status = 'pending') then 'invited'
           else 'none'
         end as viewer_state
  from communities c
  join tenants t on t.id = c.tenant_id
  where c.archived_at is null
    and c.privacy in ('public','request_to_join')
    and not exists (
      select 1 from community_members cm
      where cm.community_id = c.id and cm.user_id = auth.uid()
    )
    and not exists (
      select 1 from community_join_requests r
      where r.community_id = c.id and r.user_id = auth.uid() and r.status = 'pending'
    )
  order by
    (t.country = any (
      select tt.country from tenant_memberships tm
      join tenants tt on tt.id = tm.tenant_id
      where tm.user_id = auth.uid()
    )) desc,
    viewer_distance_m(c.location_point) asc nulls last,
    c.created_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
revoke execute on function explore_communities(int, int) from public, anon, authenticated;
grant execute on function explore_communities(int, int) to authenticated;

------------------------------------------------------------------------------
-- 4. explore_groups: viewer_state + distance_m through the parent community
------------------------------------------------------------------------------
-- 0052's filter, unchanged. Groups have no location of their own (D2): a group is as far away as
-- its community's point.
--   viewer_state: 'member' | 'none'. The rail excludes members, so it reads 'none' here; groups
--   have no request-to-join (D1).
--   Ranking: groups of communities I am in first (0052), same country, nearest, newest.
drop function if exists explore_groups(int, int);
create function explore_groups(p_limit int default 10, p_offset int default 0)
returns table (
  id uuid,
  community_id uuid,
  name text,
  is_general boolean,
  is_private boolean,
  archived_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  description text,
  thumbnail_path text,
  updated_at timestamptz,
  distance_m double precision,
  viewer_state text
)
language sql stable security definer set search_path = public as $$
  select g.id, g.community_id, g.name, g.is_general, g.is_private, g.archived_at, g.created_at,
         g.created_by, g.description, g.thumbnail_path, g.updated_at,
         viewer_distance_m(c.location_point) as distance_m,
         case when exists (select 1 from group_members gm
                           where gm.group_id = g.id and gm.user_id = auth.uid())
              then 'member' else 'none' end as viewer_state
  from groups g
  join communities c on c.id = g.community_id
  join tenants t on t.id = c.tenant_id
  where g.is_private = false
    and g.archived_at is null
    and c.archived_at is null
    and (
      c.privacy = 'public'
      or c.tenant_id in (
        select tm.tenant_id from tenant_memberships tm where tm.user_id = auth.uid()
      )
    )
    and not exists (
      select 1 from group_members gm
      where gm.group_id = g.id and gm.user_id = auth.uid()
    )
  order by
    exists (
      select 1 from community_members cm
      where cm.community_id = c.id and cm.user_id = auth.uid()
    ) desc,
    (t.country = any (
      select tt.country from tenant_memberships tm
      join tenants tt on tt.id = tm.tenant_id
      where tm.user_id = auth.uid()
    )) desc,
    viewer_distance_m(c.location_point) asc nulls last,
    g.created_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
revoke execute on function explore_groups(int, int) from public, anon, authenticated;
grant execute on function explore_groups(int, int) to authenticated;

------------------------------------------------------------------------------
-- 5. follow_player / unfollow_player (D9)
------------------------------------------------------------------------------
-- A card flips optimistically and reconciles with the returned state. The direct `follows`
-- insert/delete under RLS stays as it is for the profile screens; these add the two refusals the
-- table's policy cannot express:
--   * cannot_follow_self — the table CHECK would also refuse it, but as an opaque 23514.
--   * blocked            — a block in EITHER direction (the block model is symmetric). block_user
--                          already deletes both follow edges; this stops a new one appearing.
--   * user_not_found     — no such profile, or a deleted account.
-- Both are idempotent: following twice returns 'following', unfollowing a stranger 'none'.
-- The follow notification still fires from trg_notify_on_follow on the insert.
create or replace function follow_player(p_user uuid)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_user = v_user then raise exception 'cannot_follow_self' using errcode = 'P0001'; end if;
  if not exists (select 1 from profiles where id = p_user and deleted_at is null) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from blocks b
    where (b.blocker_id = v_user and b.blocked_id = p_user)
       or (b.blocker_id = p_user and b.blocked_id = v_user)
  ) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;

  insert into follows (follower_id, followee_id) values (v_user, p_user)
    on conflict (follower_id, followee_id) do nothing;
  return 'following';
end;
$$;
revoke execute on function follow_player(uuid) from public, anon, authenticated;
grant execute on function follow_player(uuid) to authenticated;

-- Unfollow refuses only self: removing an edge is always allowed, blocked or not (block_user has
-- already removed any edge between a blocked pair, so there is nothing to find there anyway).
create or replace function unfollow_player(p_user uuid)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_user = v_user then raise exception 'cannot_follow_self' using errcode = 'P0001'; end if;

  delete from follows where follower_id = v_user and followee_id = p_user;
  return 'none';
end;
$$;
revoke execute on function unfollow_player(uuid) from public, anon, authenticated;
grant execute on function unfollow_player(uuid) to authenticated;

------------------------------------------------------------------------------
-- 6. explore_events: signed-in only, like the other three discovery RPCs
------------------------------------------------------------------------------
revoke execute on function explore_events(int, int) from public, anon, authenticated;
grant execute on function explore_events(int, int) to authenticated;

-- Self-check so a partial paste into the hosted SQL editor cannot leave one open to anon.
do $$
declare v_open text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_open
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('explore_players','explore_communities','explore_groups','explore_events',
                      'follow_player','unfollow_player','set_community_location',
                      'create_community_with_personal_tenant')
    and (has_function_privilege('anon', p.oid, 'execute')
         or not has_function_privilege('authenticated', p.oid, 'execute'));
  if v_open is not null then
    raise exception 'discovery RPC grants wrong (anon may call, or authenticated may not): %', v_open;
  end if;
end $$;
