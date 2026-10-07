-- A founder who leaves their community, or is removed from it, keeps nothing of it. Before this
-- file, the founder of a private or request-to-join community kept finding its groups and upcoming
-- events in Explore and search, kept reading its permission toggles, its plan row and its tenant,
-- could still insert communities into its tenant over REST, and kept the Jammer+ its plan bundles —
-- for as long as the community existed, after leave_community or remove_member had taken them out.
-- Product calls (2026-10-07):
--   * a founder who leaves or is removed must not see that community in search or Explore, and
--     must lose any tenant-based access;
--   * the Jammer+ a community grants its founder ends when the founder is no longer a member of it;
--   * current members of a private or request-to-join community SHOULD read its permission toggles,
--     so the apps show the actions the community allows (a deliberate visible change, below).
-- Found while triaging the SECURITY DEFINER advisor list (0135 noted the Explore/search half);
-- every part reproduced in a throwaway copy of the schema (begin … rollback) before it was fixed.
--
-- ROOT CAUSE. tenant_memberships means "whoever created it, forever". It is a leftover of the first
-- multi-tenant design (Structure Files/01), in which a tenant was an organisation and its
-- tenant_memberships were its people. What shipped is one PERSONAL tenant per community:
-- create_community_with_personal_tenant writes exactly one tenant_memberships row, for the creator
-- (role 'community_owner'), and nothing ever deletes it — leave_community and remove_member remove
-- community_members and group_members only. Every reader that used it as "the community's people"
-- therefore never admitted the community's actual members, and kept admitting the founder after
-- they had gone. Its readers, and what each becomes:
--
-- 1. explore_groups, explore_events, search_groups, search_events (SECURITY DEFINER).
--    Each admitted a non-public community's rows through
--        c.tenant_id in (select tm.tenant_id from tenant_memberships tm where tm.user_id = <viewer>)
--    so the departed founder kept finding every public group and upcoming public event of it (and
--    search_suggest, which reads search_events and search_groups, kept suggesting them); while still
--    in, the founder was offered public events in groups they had never joined — events RLS hides
--    from them, so the card opened onto "not found"; and no other member was offered any of it.
--    THE RULE: a SECURITY DEFINER discovery function returns a row only if the table's own read
--    policy would show it to the same viewer. It may return fewer (Explore leaves out what you
--    joined, search filters by text) but never more. So each tenant clause becomes the membership
--    the read policy uses:
--      groups — "groups: read" shows a public group of a non-public community to the community's
--        MEMBERS (is_community_member). explore_groups and search_groups already require a live,
--        non-private group in a live community, so the clause becomes "the viewer is in
--        community_members for it".
--      events — "events: read" is event_is_visible. For a public event in a live, non-private group
--        of a non-public community its branches reduce to organizer, participant, invitee, or
--        MEMBER OF THE EVENT'S GROUP. Being in the community is not one of them, so in explore_events
--        and search_events the clause becomes "the viewer is in group_members for the event's
--        group" — what the discovery design always said (docs/superpowers/specs/
--        2026-06-13-discovery-explore-design.md). search_events' organizer/participant branches and
--        explore_events' organizer/participant exclusions are untouched.
--    explore_groups also gains `auth.uid() is not null`, the guard "groups: read" puts on its public
--    branch and explore_events already has. anon has no EXECUTE on it (0128) and every caller waits
--    for a session (useExploreGroups: enabled: !!uid), so no real caller notices.
--    Everything else in the four bodies — columns, ordering, the same-country boost, return shapes —
--    is the live definition unchanged. The same-country boost still reads tenant_memberships; it
--    only ORDERS rows the predicate admitted, so a departed founder keeping it reveals nothing.
--
-- 2. "community_permissions: read" — and the member bug the other way round.
--    `community_id in (select id from communities where tenant_id in (select auth_tenant_ids())
--    or privacy = 'public')`. The departed founder kept reading the five member toggles; and no
--    ordinary member of a private or request-to-join community could read them at all (admins can,
--    through the FOR ALL "community_permissions: write" policy, which also applies to SELECT).
--    useAbility (packages/api auth-context.ts) and useCommunityPermissions therefore gave every such
--    member no post composer, Create event, Invite or Approve, although the community allows them
--    (create_posts, create_events and invite_members default to true) and the server
--    (can_create_post, may_create_event, invite_to_community, may_approve_requests) accepts them.
--    Now: signed in, and the community is public or you are a member of it. Per row, through the
--    RLS helpers community_is_public / is_community_member, not an IN over communities: OR'ed with
--    the write policy, the IN form could not become a semi-join and seq-scanned communities on
--    every toggle read (useAbility reads them on the community tabs and in PostCard).
--    `auth.uid() is not null` stays in front because community_is_public is SECURITY DEFINER —
--    without it anon would gain the public communities' rows, which today it cannot read (the old
--    subquery ran under "communities: read", which asks for a session). One harmless side effect of
--    dropping that subquery: a member of an ARCHIVED community can read its toggles (only its admins
--    could) — "communities: read" hides an archived community from non-admins, so no screen reaches
--    them, and the archive guards (UX-COMM-24) refuse writes there anyway.
--
-- 3. "community_subscriptions: read" — same old predicate, so the departed founder kept reading the
--    plan row (plan, status, provider, provider_ref, current_period_end). Neither app reads this
--    table (community_plan(uuid) does, as definer), so it is NOT widened to members: signed in, and
--    the community is public (as before) or you are one of its ADMINS — the people who can change
--    the plan (set_community_plan accepts any admin since 0098). A founder who is still an admin
--    keeps it; promoted admins gain it; a founder demoted to plain member, or gone, loses it.
--
-- 4. "tenants: read own" — `id in (select auth_tenant_ids())`: the departed founder kept reading the
--    personal tenant row (name and country as typed at creation, owner_id). Now the same, AND you
--    are still a member of a community on that tenant. Nothing in either app reads tenants.
--
-- 5. What the API roles may write to communities directly.
--    INSERT — "communities: insert", WITH CHECK tenant_id in auth_tenant_ids(). Any founder, current
--    or departed, could INSERT a community straight into their tenant over REST: no admin row, no
--    general group, no permissions row, no season, and created_by not checked at all (reproduced as
--    a departed founder). Communities are created only through create_community_with_personal_tenant
--    (SECURITY DEFINER, the only function that inserts into communities, tenants or
--    tenant_memberships). Both apps and seed-e2e/seed-demo call it; seed.sql and the SQL tests insert
--    as postgres; nothing inserts directly as a user. The policy goes, and the API roles lose
--    INSERT — and DELETE, which no policy ever allowed (communities are archived, archive_community).
--    UPDATE — "communities: update" (is_community_admin(id)) stays, but the table-wide UPDATE grant
--    let any admin rewrite EVERY column, including the two this file makes load-bearing:
--      created_by, the only input to section 6 — a promoted admin who set it to themselves took
--        the founder's Jammer+, and the real founder lost it;
--      tenant_id, the only input to section 4 — a departed founder still admin of another community
--        re-pointed that community at the tenant they had left and read its tenant row again;
--    and likewise archived_at (past archive_community's guards), location_point (past
--    set_community_location's checks) and created_at. (id was never rewritable: WITH CHECK
--    is_community_admin(id) judges the new id.) Both rewrites reproduced as the
--    authenticated role. UPDATE is now granted on exactly the nine columns the apps write —
--    useUpdateCommunity (mobile and web Manage → Settings, mobile's post-create image step; builds
--    from before 0128 also send `location` there) and the web create page's image step: name,
--    description, location, type, privacy, thumbnail_path, cover_image_path,
--    cancellation_rules_enabled, cancellation_rules_text. archived_at goes through archive_community
--    and location_point through set_community_location (both SECURITY DEFINER, owned by postgres),
--    updated_at through its BEFORE UPDATE trigger — column privileges are checked on the
--    statement's SET list, not on what a trigger writes. SELECT stays.
--
-- 6. account_plan(u) — Jammer+ derived from communities.created_by (0098 narrowed it from "every
--    admin" to the creator). It never asked whether the creator was still there. Now the community
--    grants it only while `u` is in its community_members. The rule is membership, not role: a
--    founder demoted to plain member keeps it, and one who leaves and later re-joins gets it back.
--    created_by itself can no longer be rewritten over REST (section 5), so "the founder" stays the
--    person who created it.
--    Its readers keep their behaviour otherwise: account_plan_of_caller (useAccountPlan: Settings,
--    the Jammer+ paywall), set_account_plan (returns it), _blast_scope_can_customize (custom blast
--    text on a group-less event) and account_has_feature (internal, no caller). player_badge_facts
--    also reads created_by, but to COUNT communities founded for badges — history, not an
--    entitlement — and is left alone.
--
-- After this file the only policy that calls auth_tenant_ids() is "tenants: read own", now gated on
-- membership, and otherwise tenant_memberships only orders discovery results (same-country boost)
-- and feeds useAbility's tenantRoles through "memberships: read own" — a user reading their own
-- rows, which stays: tenantRoles acts only on 'super_admin', a role
-- create_community_with_personal_tenant never writes (platform admins live in platform_admins).
--
-- WHY NOT DELETE THE FOUNDER'S tenant_memberships ROW IN leave_community / remove_member INSTEAD.
-- It would hide the departed founder, but leave every ordinary member unable to read the toggles and
-- missing from the lists, keep the "events RLS hides" rows for founders who stay, need a data
-- clean-up on hosted for everyone who already left, and be one more thing every future way out of a
-- community must remember. account_plan never read tenant_memberships at all.
--
-- WHO SEES WHAT CHANGE (no app release needed; the shipped build 17 picks it up on its next fetch):
--   * a founder who left or was removed from a private or request-to-join community: none of its
--     groups or events in Explore, search or suggestions; no toggles, plan row or tenant row; and no
--     Jammer+ from that community (they keep it through their own subscription, or another community
--     they founded and are still in). The community itself stays listed in community search only if
--     it is request-to-join — which lists it for EVERY signed-in user so they can ask to join —
--     exactly as for any other outsider;
--   * a founder who left or was removed from a PUBLIC community: loses that community's Jammer+;
--     everything else about it is public and stays visible, as for anyone;
--   * a founder still in: no longer offered public events in groups of theirs they never joined;
--   * every other member of a private or request-to-join community: now offered its public groups
--     they have not joined, and the upcoming public events of their own groups (RLS already showed
--     them all of it, and join_group lets them join); and — the visible change — mobile and web now
--     show them the post composer, Create event, Invite and Approve wherever the toggles allow;
--   * admins who did not found the community: can now read its plan row;
--   * everyone: a direct REST INSERT or DELETE on communities is refused (nothing legitimate made
--     one), and an admin's direct UPDATE may set only the nine columns above (the settings screens
--     write nothing else);
--   * otherwise, public communities and anyone with no part in a non-public community: no change.
--   KNOWN CLIENT LEFTOVER IN BUILD 17: Settings → "Community Plans" is gated by useOwnedCommunities
--   (packages/api), which filtered on communities.created_by alone. A founder who left or was removed
--   still gets the row, and it opens /community/<id>/manage?section=plan onto an empty Plan section
--   (they are not an admin there; set_community_plan refuses them anyway). Nothing leaks — any
--   signed-in user reads live communities rows. The same PR filters useOwnedCommunities through the
--   caller's admin membership; it reaches testers with the next build.
--
-- NOT CHANGED: explore_communities and search_communities, whose visibility is already
-- `privacy in ('public', 'request_to_join') or <viewer is in community_members>`; tenant_memberships
-- only ranks there. Events a departed founder organises or is registered for stay findable by them
-- (search_events' organizer/participant branches), as for any ex-member — RLS shows them too.
--
-- ORDER: no dependency on the other in-flight fixes (0137, 0139–0142). None of them touches these
-- four functions, account_plan, these four policies or the grants on communities, and this file
-- re-grants nothing 0136 revoked.

-- 1. explore_groups ------------------------------------------------------------------------------
-- The live body (0128). The tenant clause becomes community membership; the session guard is added.
create or replace function explore_groups(p_limit integer default 10, p_offset integer default 0)
returns table(id uuid, community_id uuid, name text, is_general boolean, is_private boolean,
              archived_at timestamptz, created_at timestamptz, created_by uuid, description text,
              thumbnail_path text, updated_at timestamptz, distance_m double precision, viewer_state text)
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
    -- "groups: read" asks for a session on its public branch.
    and auth.uid() is not null
    and (
      c.privacy = 'public'
      -- "groups: read": a public group of a non-public community is for the community's members.
      or exists (
        select 1 from community_members cm
        where cm.community_id = c.id and cm.user_id = auth.uid()
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

-- 1. explore_events ------------------------------------------------------------------------------
-- The live body (0066, kept by 0128). The tenant clause becomes membership of the event's group.
create or replace function explore_events(p_limit integer default 10, p_offset integer default 0)
returns table(event events, distance_m double precision)
language sql stable security definer set search_path = public as $$
  select e::events as event, viewer_distance_m(e.location_point) as distance_m
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
      -- event_is_visible: outside a public community a public event is for its GROUP's members.
      or exists (select 1 from group_members gm where gm.group_id = g.id and gm.user_id = auth.uid())
    )
    and auth.uid() is not null
    and e.organizer_id <> auth.uid()
    and not exists (
      select 1 from event_participants ep where ep.event_id = e.id and ep.user_id = auth.uid()
    )
  order by
    viewer_distance_m(e.location_point) asc nulls last,
    e.starts_at asc,
    (t.country = any (
      select tt.country from tenant_memberships tm
      join tenants tt on tt.id = tm.tenant_id where tm.user_id = auth.uid()
    )) desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

-- 1. search_groups -------------------------------------------------------------------------------
-- The live body (0130). The tenant clause becomes community membership.
create or replace function search_groups(p_q text, p_filters jsonb default '{}'::jsonb,
                                         p_sort text default 'relevant'::text,
                                         p_limit integer default 20, p_offset integer default 0)
returns table(id uuid, community_id uuid, community_name text, name text, is_general boolean,
              is_private boolean, archived_at timestamptz, created_at timestamptz, created_by uuid,
              description text, thumbnail_path text, updated_at timestamptz, member_count integer,
              distance_m double precision, viewer_state text, total_count bigint)
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
         -- "groups: read": a public group of a non-public community is for the community's members.
         and (c.privacy = 'public'
              or exists (select 1 from community_members cm where cm.community_id = c.id and cm.user_id = v_uid)))
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

-- 1. search_events -------------------------------------------------------------------------------
-- The live body (0130). The tenant clause becomes membership of the event's group.
create or replace function search_events(p_q text, p_filters jsonb default '{}'::jsonb,
                                         p_sort text default 'relevant'::text,
                                         p_limit integer default 20, p_offset integer default 0)
returns table(event events, distance_m double precision, viewer_state text, total_count bigint)
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
         -- event_is_visible: outside a public community a public event is for its GROUP's members.
         and (c.privacy = 'public'
              or exists (select 1 from group_members gm where gm.group_id = g.id and gm.user_id = v_uid)))
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

-- 2. community_permissions: public, or a member ------------------------------------------------
drop policy if exists "community_permissions: read" on community_permissions;
create policy "community_permissions: read" on community_permissions for select
  using (auth.uid() is not null
         and (community_is_public(community_id) or is_community_member(community_id)));

-- 3. community_subscriptions: public, or an admin ----------------------------------------------
drop policy if exists "community_subscriptions: read" on community_subscriptions;
create policy "community_subscriptions: read" on community_subscriptions for select
  using (auth.uid() is not null
         and (community_is_public(community_id) or is_community_admin(community_id)));

-- 4. tenants: your own, while you are still in its community ------------------------------------
-- The communities subquery runs under "communities: read" and uses communities_tenant_id_idx.
drop policy if exists "tenants: read own" on tenants;
create policy "tenants: read own" on tenants for select
  using (id in (select auth_tenant_ids())
         and exists (select 1 from communities c
                      where c.tenant_id = tenants.id and is_community_member(c.id)));

-- 5. communities: created only by create_community_with_personal_tenant; admins edit nine columns -
drop policy if exists "communities: insert" on communities;
-- The default ACL gave the API roles every privilege; with the policy gone RLS already refuses the
-- insert, and the grant goes too so the refusal does not hang on one policy's absence.
revoke insert, delete on communities from public, anon, authenticated;
-- A table-level REVOKE also clears any column-level UPDATE grants, so this pair re-runs cleanly.
-- anon gets none: "communities: update" needs a session anyway.
revoke update on communities from public, anon, authenticated;
grant update (name, description, location, type, privacy, thumbnail_path, cover_image_path,
              cancellation_rules_enabled, cancellation_rules_text)
  on communities to authenticated;

-- 6. account_plan: the founder's Jammer+ lasts while they are a member --------------------------
-- The live body (0098), with the membership test added.
create or replace function account_plan(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from subscriptions s
      where s.user_id = u and s.plan_id = 'jammer_plus' and s.status in ('trialing','active')
    ) then 'jammer_plus'
    when exists (
      select 1 from communities c
      where c.created_by = u
        -- Only while the founder is still in it: leaving or being removed ends the perk.
        and exists (select 1 from community_members cm where cm.community_id = c.id and cm.user_id = u)
        and community_has_feature(c.id, 'jammer_plus_included')
    ) then 'jammer_plus'
    else 'free'
  end;
$$;

-- CREATE OR REPLACE keeps each function's ACL, so the grants 0098/0128/0130/0136 left stand: the
-- four discovery functions for signed-in users only, account_plan for nobody (internal since 0094;
-- the app reads its own plan through account_plan_of_caller). Restated, never widened, so the
-- outcome does not depend on how each grant arrived.
revoke execute on function explore_groups(integer, integer) from public, anon, authenticated;
grant  execute on function explore_groups(integer, integer) to authenticated;
revoke execute on function explore_events(integer, integer) from public, anon, authenticated;
grant  execute on function explore_events(integer, integer) to authenticated;
revoke execute on function search_groups(text, jsonb, text, integer, integer) from public, anon, authenticated;
grant  execute on function search_groups(text, jsonb, text, integer, integer) to authenticated;
revoke execute on function search_events(text, jsonb, text, integer, integer) from public, anon, authenticated;
grant  execute on function search_events(text, jsonb, text, integer, integer) to authenticated;
revoke execute on function account_plan(uuid) from public, anon, authenticated;

-- Self-check, in the spirit of 0094/0097/0101/0132–0136. Catalog state, plus the four discovery
-- bodies run with no session and as a signed-in stranger (a random id: nothing is written). Proving
-- the departed founder loses each thing needs several users and communities, which is what the REST
-- test (infra/supabase/tests/discovery-departed-founder.test.mjs) does on a scratch stack — a hosted
-- paste must not create and tear down communities. The editor runs the whole paste as one
-- transaction, so if this raises, nothing above it lands.
do $$
declare
  v_eg text := (select prosrc from pg_proc where oid = 'public.explore_groups(integer,integer)'::regprocedure);
  v_ee text := (select prosrc from pg_proc where oid = 'public.explore_events(integer,integer)'::regprocedure);
  v_sg text := (select prosrc from pg_proc where oid = 'public.search_groups(text,jsonb,text,integer,integer)'::regprocedure);
  v_se text := (select prosrc from pg_proc where oid = 'public.search_events(text,jsonb,text,integer,integer)'::regprocedure);
  v_ap text := (select prosrc from pg_proc where oid = 'public.account_plan(uuid)'::regprocedure);
  v_q  text;
  -- Section 5's UPDATE grant: what useUpdateCommunity and the web create page write.
  v_editable text[] := array['name', 'description', 'location', 'type', 'privacy', 'thumbnail_path',
                             'cover_image_path', 'cancellation_rules_enabled', 'cancellation_rules_text'];
  v_col text;
begin
  -- 1. No discovery function admits rows through tenant_memberships any more (the same-country
  -- ranking may still read it; that is not a `tenant_id in (` clause) ...
  if v_eg ~* 'tenant_id\s+in\s*\(' or v_ee ~* 'tenant_id\s+in\s*\(' or v_sg ~* 'tenant_id\s+in\s*\('
     or v_se ~* 'tenant_id\s+in\s*\(' then
    raise exception 'a discovery function still admits rows through tenant_memberships (a departed founder keeps finding the community)';
  end if;
  -- ... and each admits them through the membership its table's read policy uses: community
  -- membership for groups ("groups: read"), group membership for events (event_is_visible).
  if v_eg !~ '\mor\s+exists\s*\(\s*select 1 from community_members cm\s+where cm\.community_id = c\.id and cm\.user_id = auth\.uid\(\)'
     or v_sg !~ '\mor\s+exists\s*\(select 1 from community_members cm where cm\.community_id = c\.id and cm\.user_id = v_uid\)'
     or v_ee !~ '\mor\s+exists\s*\(select 1 from group_members gm where gm\.group_id = g\.id and gm\.user_id = auth\.uid\(\)\)'
     or v_se !~ '\mor\s+exists\s*\(select 1 from group_members gm where gm\.group_id = g\.id and gm\.user_id = v_uid\)' then
    raise exception 'a discovery function is missing its membership predicate';
  end if;
  if v_eg !~ 'and auth\.uid\(\) is not null' then
    raise exception 'explore_groups lost its session guard';
  end if;
  if has_function_privilege('anon', 'public.explore_groups(integer,integer)', 'execute')
     or has_function_privilege('anon', 'public.explore_events(integer,integer)', 'execute')
     or has_function_privilege('anon', 'public.search_groups(text,jsonb,text,integer,integer)', 'execute')
     or has_function_privilege('anon', 'public.search_events(text,jsonb,text,integer,integer)', 'execute') then
    raise exception 'anon can execute a discovery function';
  end if;
  if not (has_function_privilege('authenticated', 'public.explore_groups(integer,integer)', 'execute')
          and has_function_privilege('authenticated', 'public.explore_events(integer,integer)', 'execute')
          and has_function_privilege('authenticated', 'public.search_groups(text,jsonb,text,integer,integer)', 'execute')
          and has_function_privilege('authenticated', 'public.search_events(text,jsonb,text,integer,integer)', 'execute')) then
    raise exception 'authenticated can no longer execute a discovery function — Explore and search would break';
  end if;

  -- 2–4. The read policies. No policy anywhere decides anything through auth_tenant_ids() but
  -- "tenants: read own", and that one also asks for current membership.
  if exists (select 1 from pg_policy pol
              where (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' '
                     || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~ 'auth_tenant_ids'
                and not (pol.polrelid = 'public.tenants'::regclass and pol.polname = 'tenants: read own')) then
    raise exception 'a policy still decides visibility or writes through auth_tenant_ids() — the founder-forever leftover';
  end if;
  select pg_get_expr(polqual, polrelid) into v_q from pg_policy
   where polrelid = 'public.tenants'::regclass and polname = 'tenants: read own' and polcmd = 'r';
  if v_q is null or v_q !~ 'is_community_member\(c\.id\)' then
    raise exception '"tenants: read own" does not ask for current membership';
  end if;
  select pg_get_expr(polqual, polrelid) into v_q from pg_policy
   where polrelid = 'public.community_permissions'::regclass and polname = 'community_permissions: read' and polcmd = 'r';
  if v_q is null or v_q !~ 'auth\.uid\(\) IS NOT NULL'
     or v_q !~ 'community_is_public\(community_id\) OR is_community_member\(community_id\)' then
    raise exception '"community_permissions: read" is not "signed in, and public or a member"';
  end if;
  select pg_get_expr(polqual, polrelid) into v_q from pg_policy
   where polrelid = 'public.community_subscriptions'::regclass and polname = 'community_subscriptions: read' and polcmd = 'r';
  if v_q is null or v_q !~ 'auth\.uid\(\) IS NOT NULL'
     or v_q !~ 'community_is_public\(community_id\) OR is_community_admin\(community_id\)'
     or v_q ~ 'is_community_member' then
    raise exception '"community_subscriptions: read" is not "signed in, and public or an admin"';
  end if;
  if (select count(*) from pg_policy
       where polrelid in ('public.community_permissions'::regclass, 'public.community_subscriptions'::regclass,
                          'public.tenants'::regclass)
         and polcmd = 'r') <> 3 then
    raise exception 'an extra SELECT policy on community_permissions, community_subscriptions or tenants would widen the reads above';
  end if;

  -- 5. Nobody inserts or deletes a community directly; reading still works, and an admin's direct
  -- edit reaches the nine settings columns and nothing else.
  if exists (select 1 from pg_policy where polrelid = 'public.communities'::regclass and polcmd in ('a', 'd', '*')) then
    raise exception 'an INSERT, DELETE or ALL policy survives on communities';
  end if;
  -- has_any_column_privilege: a column-level INSERT grant would count too.
  if has_any_column_privilege('anon', 'public.communities', 'insert')
     or has_table_privilege('anon', 'public.communities', 'delete')
     or has_any_column_privilege('authenticated', 'public.communities', 'insert')
     or has_table_privilege('authenticated', 'public.communities', 'delete') then
    raise exception 'an API role can still insert or delete communities directly';
  end if;
  if not has_table_privilege('authenticated', 'public.communities', 'select') then
    raise exception 'authenticated can no longer read communities — every community screen would break';
  end if;
  -- UPDATE: exactly the nine columns the settings screens write, for authenticated only. Checked
  -- column by column — has_column_privilege counts a table-level, column-level or PUBLIC grant
  -- alike — so a table-wide grant coming back trips the second loop, and a column missing from the
  -- grant trips the first. (has_table_privilege(..., 'update') is false under column grants.)
  foreach v_col in array v_editable loop
    if not has_column_privilege('authenticated', 'public.communities', v_col, 'update') then
      raise exception 'authenticated can no longer UPDATE communities.% — Manage → Settings would break', v_col;
    end if;
  end loop;
  for v_col in select a.attname::text from pg_attribute a
                where a.attrelid = 'public.communities'::regclass and a.attnum > 0 and not a.attisdropped
                  and a.attname::text <> all (v_editable) loop
    if has_column_privilege('anon', 'public.communities', v_col, 'update')
       or has_column_privilege('authenticated', 'public.communities', v_col, 'update') then
      raise exception 'an API role can UPDATE communities.% directly (created_by decides account_plan, tenant_id decides "tenants: read own")', v_col;
    end if;
  end loop;
  if has_any_column_privilege('anon', 'public.communities', 'update') then
    raise exception 'anon can UPDATE communities';
  end if;
  -- ... and which rows stays the admin's call.
  if exists (select 1 from pg_policy
              where polrelid = 'public.communities'::regclass and polcmd = 'w'
                and (coalesce(pg_get_expr(polqual, polrelid), '') <> 'is_community_admin(id)'
                     or coalesce(pg_get_expr(polwithcheck, polrelid), '') <> 'is_community_admin(id)'))
     or not exists (select 1 from pg_policy
                     where polrelid = 'public.communities'::regclass and polname = 'communities: update'
                       and polcmd = 'w') then
    raise exception '"communities: update" is no longer admins only';
  end if;

  -- 6. The founder's Jammer+ asks for membership, and account_plan stays internal.
  if v_ap !~ 'c\.created_by = u'
     or v_ap !~ 'exists \(select 1 from community_members cm where cm\.community_id = c\.id and cm\.user_id = u\)' then
    raise exception 'account_plan grants a community''s Jammer+ to a founder who is no longer a member';
  end if;
  if has_function_privilege('anon', 'public.account_plan(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.account_plan(uuid)', 'execute') then
    raise exception 'account_plan is callable by an API role — it answers any user''s plan';
  end if;
  if account_plan(gen_random_uuid()) <> 'free' then
    raise exception 'account_plan does not answer free for a user with nothing';
  end if;

  -- The bodies run. No session: Explore lists nothing, search refuses. Hosted runs this with no JWT
  -- claims (dashboard SQL editor), as does a local migration.
  if nullif(current_setting('request.jwt.claims', true), '') is null
     and nullif(current_setting('request.jwt.claim.sub', true), '') is null then
    if exists (select 1 from explore_groups(50, 0)) or exists (select 1 from explore_events(50, 0)) then
      raise exception 'explore_groups / explore_events answer without a session';
    end if;
    begin
      perform search_groups('', '{}'::jsonb, 'relevant', 1, 0);
      raise exception 'search_groups answered without a session';
    exception when others then
      if sqlerrm <> 'not authenticated' then raise; end if;
    end;
    -- As a signed-in stranger who belongs to nothing, every group and event the four functions
    -- return must belong to a public community. This also runs the two plpgsql query bodies end to
    -- end, which CREATE OR REPLACE alone does not. The claim is local to this transaction and is
    -- cleared again before anything else runs.
    perform set_config('request.jwt.claims',
                       json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    if exists (select 1 from search_groups('', '{}'::jsonb, 'relevant', 1000, 0) x
                 join communities c on c.id = x.community_id where c.privacy <> 'public')
       or exists (select 1 from explore_groups(1000, 0) x
                 join communities c on c.id = x.community_id where c.privacy <> 'public')
       or exists (select 1 from search_events('', '{}'::jsonb, 'relevant', 1000, 0) x
                 join groups g on g.id = (x.event).group_id join communities c on c.id = g.community_id
                 where c.privacy <> 'public')
       or exists (select 1 from explore_events(1000, 0) x
                 join groups g on g.id = (x.event).group_id join communities c on c.id = g.community_id
                 where c.privacy <> 'public') then
      perform set_config('request.jwt.claims', '', true);
      raise exception 'a stranger finds a group or event of a private or request-to-join community';
    end if;
    perform set_config('request.jwt.claims', '', true);
  end if;
end $$;
