-- 0052_explore_rpcs.sql
-- Discovery / Explore ranking RPCs. SECURITY DEFINER: each re-applies visibility
-- explicitly (no RLS inside definers), excludes what the viewer already belongs to,
-- and ranks by recency + co-membership + same-country. Distance is deliberately NOT
-- included yet (no geo columns / coordinate capture exist). Same signature
-- (p_limit, p_offset) powers both the rail (limit 10) and "See all" (paged).
--
-- DISCOVERY ESCAPE-HATCH: explore_events surfaces non-private events in PUBLIC groups
-- of visible communities to NON-members (so they can be discovered and joined). This is
-- intentionally broader than event_is_visible (members-only for non-private events).

-- Communities: public/request_to_join, not archived, viewer not a member.
create or replace function explore_communities(p_limit int default 10, p_offset int default 0)
returns setof communities
language sql stable security definer set search_path = public as $$
  select c.*
  from communities c
  join tenants t on t.id = c.tenant_id
  where c.archived_at is null
    and c.privacy in ('public','request_to_join')
    and not exists (
      select 1 from community_members cm
      where cm.community_id = c.id and cm.user_id = auth.uid()
    )
  order by
    (t.country = any (
      select tt.country from tenant_memberships tm
      join tenants tt on tt.id = tm.tenant_id
      where tm.user_id = auth.uid()
    )) desc,
    c.created_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

-- Groups: public, not archived, parent community visible (public or viewer's tenant)
-- and not archived, viewer not a member. Boost groups whose community the viewer is in.
create or replace function explore_groups(p_limit int default 10, p_offset int default 0)
returns setof groups
language sql stable security definer set search_path = public as $$
  select g.*
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
    g.created_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

-- Events: upcoming scheduled non-private events in a public group of a visible community,
-- viewer not already organizer/participant. (Standalone events are always private, so
-- they never surface here.)
create or replace function explore_events(p_limit int default 10, p_offset int default 0)
returns setof events
language sql stable security definer set search_path = public as $$
  select e.*
  from events e
  join groups g on g.id = e.group_id
  join communities c on c.id = g.community_id
  join tenants t on t.id = c.tenant_id
  where e.deleted_at is null
    and e.status = 'scheduled'
    and e.starts_at >= now()
    and e.is_private = false
    and e.group_id is not null
    and g.archived_at is null
    and c.archived_at is null
    and g.is_private = false
    and (
      c.privacy = 'public'
      or c.tenant_id in (
        select tm.tenant_id from tenant_memberships tm where tm.user_id = auth.uid()
      )
    )
    and auth.uid() is not null
    and e.organizer_id <> auth.uid()
    and not exists (
      select 1 from event_participants ep
      where ep.event_id = e.id and ep.user_id = auth.uid()
    )
  order by
    e.starts_at asc,
    (t.country = any (
      select tt.country from tenant_memberships tm
      join tenants tt on tt.id = tm.tenant_id
      where tm.user_id = auth.uid()
    )) desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

-- Players: profiles sharing >=1 community or group with the viewer, excluding self.
create or replace function explore_players(p_limit int default 10, p_offset int default 0)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  dominant_hand text,
  court_side text,
  shared_count int
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
  select p.id, p.full_name, p.avatar_url, p.dominant_hand, p.court_side, a.shared_count
  from agg a
  join profiles p on p.id = a.uid
  order by a.shared_count desc, p.created_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

grant execute on function explore_communities, explore_groups, explore_events, explore_players
  to authenticated;
