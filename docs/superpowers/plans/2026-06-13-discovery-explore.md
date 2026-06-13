# Discovery — Explore Tab (Mobile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Explore tab on mobile — four ranked suggestion rails (Players you might know, Events, Communities, Groups), each with a "See all" full list, plus the Create-Event FAB — backed by four `SECURITY DEFINER` ranking RPCs and thin `@padel/api` hooks.

**Architecture:** Discovery is a read layer over existing tables. Candidate selection + ranking live in four `SECURITY DEFINER` SQL functions (`explore_communities/_groups/_events/_players`), each re-applying visibility (no RLS inside definers), excluding what the viewer already belongs to, and ranking by recency + co-membership + same-country (no distance — deferred). `@padel/api` exposes TanStack Query hooks (rail = limit 10, see-all = infinite page on `p_offset`); the mobile Explore tab is pure UI reusing the existing `EventCard` and the `communities`/`groups` generated Row types.

**Tech Stack:** Supabase Postgres (plpgsql/sql `SECURITY DEFINER` RPCs), `@tanstack/react-query`, Expo SDK 56 + Expo Router, `@shopify/flash-list`, `expo-symbols`, Vitest, local Supabase via `pnpm dlx supabase@latest --workdir infra`.

---

## Context

This implements the **Explore** surface from `Requirements/discovery.md` (DS-01..DS-03, DS-17..DS-20). The full design is in `docs/superpowers/specs/2026-06-13-discovery-explore-design.md`. **Search is deferred** (overlay, three states, `recent_searches`, scopes/banners, unified filter, the Home/Profile/Events-list search icons). **Distance is deferred** (no geo columns; no coordinate capture exists yet). The Players rail's tap is a **no-op** until the Profile module + follow system land.

**What exists (do not rebuild):** migrations `0001`–`0051`. Tables: `communities(id,tenant_id,name,description,type,privacy[public|request_to_join|private],location,archived_at,created_at)`, `community_members(community_id,user_id,role)`, `groups(id,community_id,name,is_general,is_private,archived_at,created_at)`, `group_members(group_id,user_id)`, `events(id,group_id,organizer_id,event_type,specification,starts_at,status[scheduled|in_progress|completed|cancelled],is_private,deleted_at,name,...)`, `event_participants(event_id,user_id,status)`, `profiles(id,full_name,avatar_url,dominant_hand,court_side,created_at)`, `tenants(id,country[PT|BR])`, `tenant_memberships(user_id,tenant_id)`. Helpers `auth_tenant_ids()`, `is_community_admin(c)`, `is_group_member(g)`, `event_is_visible(e,u)`. `@padel/api` modules `communities`/`groups`/`events` with `useDb()` (from `@padel/auth`), `qk` keys, `db.rpc(...)`. Mobile: `apps/mobile/app/(tabs)/_layout.tsx` (tabs `index`, `two`, `community`), placeholder `(tabs)/two.tsx`, `components/event/EventCard.tsx`, i18n via `apps/mobile/lib/i18n-mobile.ts` `registerMobileCopy`.

**Conventions:** sequential additive migration `infra/supabase/migrations/0052_explore_rpcs.sql`; functions `language sql stable security definer set search_path = public`; `grant execute ... to authenticated`; run Supabase with `--workdir infra` after `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token`; regenerate `packages/db/src/database.types.ts` after the migration; SQL tests under `infra/supabase/tests/*.sql` using `set_config('role','authenticated',true)` + `set_config('request.jwt.claims',...,true)` + the `PT001` sentinel, run with `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < <file>`; `@padel/api` exports raw TS from `src/index.ts`; strict TS; all copy via `useT('discovery')`.

**Deliberate discovery escape-hatch (flag):** `explore_events` surfaces non-private events in **public** groups of visible communities to **non-members** so they can be discovered/joined. This is intentionally broader than `event_is_visible` (which only shows non-private events to group members). Documented inline in the migration.

---

## File Structure

```
infra/supabase/migrations/
  0052_explore_rpcs.sql        4 SECURITY DEFINER ranking fns + grants
infra/supabase/tests/
  explore_communities.sql      exclusion/privacy/ordering/paging
  explore_groups.sql           private-group + non-member visibility
  explore_events.sql           upcoming/non-private/public-group/participant-exclusion
  explore_players.sql          co-membership + self-exclusion
packages/db/src/database.types.ts   (regenerated)
packages/api/src/
  query-keys.ts                (modify: + explore keys)
  discovery/queries.ts         8 hooks (4 rail + 4 see-all)
  discovery/queries.test.ts    pure key-shape assertions
  index.ts                     (modify: export discovery/queries)
apps/mobile/lib/i18n-mobile.ts        (modify: + discovery namespace)
apps/mobile/app/(tabs)/_layout.tsx    (modify: two -> explore tab)
apps/mobile/app/(tabs)/explore.tsx    Explore tab screen (rename of two.tsx)
apps/mobile/app/explore/_layout.tsx   Stack for see-all
apps/mobile/app/explore/[type].tsx    See-all paged list
apps/mobile/components/explore/
  SuggestionRail.tsx           generic rail (title + See all + horizontal FlashList)
  CommunityCard.tsx            community card + Request-to-join CTA
  GroupCard.tsx                group card
  PlayerCard.tsx               player card (tap no-op)
```

---

## Task 1: The four ranking RPCs (migration 0052)

**Files:**
- Create: `infra/supabase/migrations/0052_explore_rpcs.sql`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0052_explore_rpcs.sql` with exactly:

```sql
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
```

- [ ] **Step 2: Apply the migration to a fresh DB**

Run: `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`
Expected: applies through `0052_explore_rpcs.sql` with no error; ends `Finished supabase db reset`.

- [ ] **Step 3: Verify the four functions exist**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -tc "select proname from pg_proc where proname like 'explore_%' order by proname;"`
Expected: four rows — `explore_communities`, `explore_events`, `explore_groups`, `explore_players`.

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/migrations/0052_explore_rpcs.sql
git commit -m "feat(discovery): explore ranking RPCs (communities/groups/events/players)"
```

---

## Task 2: SQL integration tests for the RPCs

**Files:**
- Create: `infra/supabase/tests/explore_communities.sql`, `explore_groups.sql`, `explore_events.sql`, `explore_players.sql`

- [ ] **Step 1: Write `explore_communities.sql`**

```sql
-- explore_communities: excludes own/archived/private; surfaces public + request_to_join; paging.
-- 'PT001' = expected behaviour did not hold.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ec1@x.com'),
  ('e1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ec2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1000001-0000-0000-0000-000000000001','ec1@x.com','+351900200001','EcOwner'),
  ('e1000002-0000-0000-0000-000000000002','ec2@x.com','+351900200002','EcViewer') on conflict do nothing;

do $$
declare cid_pub uuid; cid_req uuid; cid_priv uuid; n int;
begin
  -- owner1 creates one public, one request_to_join, one private community.
  -- Owned-cap is 1 per user; use create RPC's personal-tenant path per community via distinct owners is
  -- not needed here because we insert communities directly under owner1's tenant for the test.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e1000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid_pub := create_community_with_personal_tenant('EcPub','club','PT','public');

  -- Insert a request_to_join and a private community under the same tenant as cid_pub (bypass RLS as postgres).
  perform set_config('role','postgres',true);
  insert into communities (tenant_id, name, type, privacy)
    select tenant_id, 'EcReq', 'club', 'request_to_join' from communities where id = cid_pub returning id into cid_req;
  insert into communities (tenant_id, name, type, privacy)
    select tenant_id, 'EcPriv', 'club', 'private' from communities where id = cid_pub returning id into cid_priv;

  -- viewer2 (not a member of any) calls explore_communities.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e1000002-0000-0000-0000-000000000002","role":"authenticated"}',true);

  if not exists (select 1 from explore_communities(50,0) where id = cid_pub) then
    raise exception using errcode='PT001', message='public community not surfaced';
  end if;
  if not exists (select 1 from explore_communities(50,0) where id = cid_req) then
    raise exception using errcode='PT001', message='request_to_join community not surfaced';
  end if;
  if exists (select 1 from explore_communities(50,0) where id = cid_priv) then
    raise exception using errcode='PT001', message='private community leaked';
  end if;

  -- owner1 must NOT see their own community (already a member).
  perform set_config('request.jwt.claims','{"sub":"e1000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  if exists (select 1 from explore_communities(50,0) where id = cid_pub) then
    raise exception using errcode='PT001', message='own community surfaced to member';
  end if;

  -- paging: limit 1 returns at most 1 row.
  perform set_config('request.jwt.claims','{"sub":"e1000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  select count(*) into n from explore_communities(1,0);
  if n <> 1 then raise exception using errcode='PT001', message='limit not honoured'; end if;

  raise notice 'OK explore_communities';
end $$;
rollback;
```

- [ ] **Step 2: Write `explore_groups.sql`**

```sql
-- explore_groups: surfaces public groups in visible communities to non-members; hides private groups
-- and groups the viewer already belongs to.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e2000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','eg1@x.com'),
  ('e2000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','eg2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e2000001-0000-0000-0000-000000000001','eg1@x.com','+351900300001','EgOwner'),
  ('e2000002-0000-0000-0000-000000000002','eg2@x.com','+351900300002','EgViewer') on conflict do nothing;

do $$
declare cid uuid; gid_pub uuid; gid_priv uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e2000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('EgPubC','club','PT','public');

  perform set_config('role','postgres',true);
  insert into groups (community_id, name, is_private) values (cid,'EgPubG',false) returning id into gid_pub;
  insert into groups (community_id, name, is_private) values (cid,'EgPrivG',true) returning id into gid_priv;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e2000002-0000-0000-0000-000000000002","role":"authenticated"}',true);

  if not exists (select 1 from explore_groups(50,0) where id = gid_pub) then
    raise exception using errcode='PT001', message='public group not surfaced to non-member';
  end if;
  if exists (select 1 from explore_groups(50,0) where id = gid_priv) then
    raise exception using errcode='PT001', message='private group leaked';
  end if;

  -- make viewer a member of the public group -> it must drop out.
  perform set_config('role','postgres',true);
  insert into group_members (group_id, user_id) values (gid_pub,'e2000002-0000-0000-0000-000000000002') on conflict do nothing;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e2000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists (select 1 from explore_groups(50,0) where id = gid_pub) then
    raise exception using errcode='PT001', message='joined group still surfaced';
  end if;

  raise notice 'OK explore_groups';
end $$;
rollback;
```

- [ ] **Step 3: Write `explore_events.sql`**

```sql
-- explore_events: upcoming non-private events in public groups; excludes past, private, completed,
-- and events the viewer organizes/participates in.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e3000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ee1@x.com'),
  ('e3000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ee2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e3000001-0000-0000-0000-000000000001','ee1@x.com','+351900400001','EeOrg'),
  ('e3000002-0000-0000-0000-000000000002','ee2@x.com','+351900400002','EeViewer') on conflict do nothing;

do $$
declare cid uuid; gid uuid; ev_up uuid; ev_past uuid; ev_priv uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e3000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('EeC','club','PT','public');

  perform set_config('role','postgres',true);
  insert into groups (community_id, name, is_private) values (cid,'EeG',false) returning id into gid;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, is_private)
    values (gid,'e3000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() + interval '2 days',60,'organizing_only','EeUpcoming',false) returning id into ev_up;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, is_private)
    values (gid,'e3000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() - interval '2 days',60,'organizing_only','EePast',false) returning id into ev_past;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, is_private)
    values (gid,'e3000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() + interval '3 days',60,'organizing_only','EePriv',true) returning id into ev_priv;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e3000002-0000-0000-0000-000000000002","role":"authenticated"}',true);

  if not exists (select 1 from explore_events(50,0) where id = ev_up) then
    raise exception using errcode='PT001', message='upcoming public event not surfaced';
  end if;
  if exists (select 1 from explore_events(50,0) where id = ev_past) then
    raise exception using errcode='PT001', message='past event surfaced';
  end if;
  if exists (select 1 from explore_events(50,0) where id = ev_priv) then
    raise exception using errcode='PT001', message='private event surfaced';
  end if;

  -- organizer must not see their own event.
  perform set_config('request.jwt.claims','{"sub":"e3000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  if exists (select 1 from explore_events(50,0) where id = ev_up) then
    raise exception using errcode='PT001', message='own event surfaced to organizer';
  end if;

  -- participant must not see the event they are in.
  perform set_config('role','postgres',true);
  insert into event_participants (event_id, user_id, status) values (ev_up,'e3000002-0000-0000-0000-000000000002','confirmed') on conflict do nothing;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e3000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists (select 1 from explore_events(50,0) where id = ev_up) then
    raise exception using errcode='PT001', message='joined event surfaced';
  end if;

  raise notice 'OK explore_events';
end $$;
rollback;
```

> Note: the `event_participants` insert in the last block uses only `(event_id, user_id, status)`. If `db reset` errors on a NOT NULL column there, add the missing column with a literal in this test only — but the events module created `event_participants` with defaults for `joined_at`, so the three columns suffice.

- [ ] **Step 4: Write `explore_players.sql`**

```sql
-- explore_players: surfaces profiles sharing a community/group with the viewer; excludes self and
-- non-co-members.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e4000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ep1@x.com'),
  ('e4000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ep2@x.com'),
  ('e4000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ep3@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e4000001-0000-0000-0000-000000000001','ep1@x.com','+351900500001','EpOwner'),
  ('e4000002-0000-0000-0000-000000000002','ep2@x.com','+351900500002','EpCoMember'),
  ('e4000003-0000-0000-0000-000000000003','ep3@x.com','+351900500003','EpStranger') on conflict do nothing;

do $$
declare cid uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e4000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('EpC','club','PT','public');

  -- add EpCoMember to the owner's community.
  perform set_config('role','postgres',true);
  insert into community_members (community_id, user_id, role) values (cid,'e4000002-0000-0000-0000-000000000002','member') on conflict do nothing;

  -- viewer = owner. Expect EpCoMember surfaced, EpStranger not, self not.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e4000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  if not exists (select 1 from explore_players(50,0) where id = 'e4000002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='co-member not surfaced';
  end if;
  if exists (select 1 from explore_players(50,0) where id = 'e4000003-0000-0000-0000-000000000003') then
    raise exception using errcode='PT001', message='stranger surfaced';
  end if;
  if exists (select 1 from explore_players(50,0) where id = 'e4000001-0000-0000-0000-000000000001') then
    raise exception using errcode='PT001', message='self surfaced';
  end if;

  raise notice 'OK explore_players';
end $$;
rollback;
```

- [ ] **Step 5: Run all four tests against a fresh DB**

Run:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset
for f in explore_communities explore_groups explore_events explore_players; do
  echo "== $f =="; docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/$f.sql
done
```
Expected: each prints `OK explore_<name>` (NOTICE) and no `PT001`/error. If any raises `PT001`, fix the corresponding RPC in `0052_explore_rpcs.sql`, re-`db reset`, re-run.

- [ ] **Step 6: Commit**

```bash
git add infra/supabase/tests/explore_*.sql
git commit -m "test(discovery): explore RPC visibility/exclusion/ordering tests"
```

---

## Task 3: Regenerate DB types

**Files:**
- Modify: `packages/db/src/database.types.ts` (generated)

- [ ] **Step 1: Regenerate**

Run: `pnpm dlx supabase@latest --workdir infra gen types typescript --local > packages/db/src/database.types.ts`
Expected: file rewritten, no error.

- [ ] **Step 2: Verify the RPC signatures landed**

Run: `grep -E "explore_communities|explore_groups|explore_events|explore_players" packages/db/src/database.types.ts | head`
Expected: matches for all four function names (under the `Functions` section).

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/database.types.ts
git commit -m "chore(db): regenerate types for explore RPCs"
```

---

## Task 4: `@padel/api` discovery hooks

**Files:**
- Modify: `packages/api/src/query-keys.ts`
- Create: `packages/api/src/discovery/queries.ts`
- Create: `packages/api/src/discovery/queries.test.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Add explore query keys**

In `packages/api/src/query-keys.ts`, add these lines inside the `qk` object (before the closing `};`):

```ts
  exploreCommunities: ['explore', 'communities'] as const,
  exploreGroups: ['explore', 'groups'] as const,
  exploreEvents: ['explore', 'events'] as const,
  explorePlayers: ['explore', 'players'] as const,
  exploreCommunitiesList: ['explore', 'communities', 'list'] as const,
  exploreGroupsList: ['explore', 'groups', 'list'] as const,
  exploreEventsList: ['explore', 'events', 'list'] as const,
  explorePlayersList: ['explore', 'players', 'list'] as const,
```

- [ ] **Step 2: Write the failing key test**

Create `packages/api/src/discovery/queries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';

describe('explore query keys', () => {
  it('rail keys are stable arrays', () => {
    expect(qk.exploreCommunities).toEqual(['explore', 'communities']);
    expect(qk.exploreGroups).toEqual(['explore', 'groups']);
    expect(qk.exploreEvents).toEqual(['explore', 'events']);
    expect(qk.explorePlayers).toEqual(['explore', 'players']);
  });
  it('see-all keys extend rail keys with "list"', () => {
    expect(qk.exploreCommunitiesList).toEqual(['explore', 'communities', 'list']);
    expect(qk.exploreEventsList).toEqual(['explore', 'events', 'list']);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @padel/api test -- --run` (or `pnpm vitest run packages/api/src/discovery/queries.test.ts`)
Expected: FAIL — `qk.exploreCommunities` is `undefined` if Step 1 was skipped, OR PASS if Step 1 already added the keys. (Keys are added in Step 1; this test guards them. If it already passes, proceed.)

- [ ] **Step 4: Write the discovery hooks**

Create `packages/api/src/discovery/queries.ts`:

```ts
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

const RAIL_LIMIT = 10;
const PAGE_SIZE = 20;

// --- Rails (limit 10) ---

export const useExploreCommunities = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.exploreCommunities,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('explore_communities', {
        p_limit: RAIL_LIMIT,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useExploreGroups = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.exploreGroups,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('explore_groups', { p_limit: RAIL_LIMIT, p_offset: 0 });
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useExploreEvents = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.exploreEvents,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('explore_events', { p_limit: RAIL_LIMIT, p_offset: 0 });
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useExplorePlayers = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.explorePlayers,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('explore_players', { p_limit: RAIL_LIMIT, p_offset: 0 });
      if (error) throw error;
      return data ?? [];
    },
  });
};

// --- See-all (paged) ---

const pageParam = (lastPage: unknown[], allPages: unknown[][]) =>
  lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE;

export const useExploreCommunitiesList = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.exploreCommunitiesList,
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('explore_communities', {
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: pageParam,
  });
};

export const useExploreGroupsList = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.exploreGroupsList,
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('explore_groups', { p_limit: PAGE_SIZE, p_offset: offset });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: pageParam,
  });
};

export const useExploreEventsList = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.exploreEventsList,
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('explore_events', { p_limit: PAGE_SIZE, p_offset: offset });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: pageParam,
  });
};

export const useExplorePlayersList = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.explorePlayersList,
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('explore_players', { p_limit: PAGE_SIZE, p_offset: offset });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: pageParam,
  });
};
```

- [ ] **Step 5: Export from the package index**

In `packages/api/src/index.ts`, add (alongside the other module exports):

```ts
export * from './discovery/queries';
```

- [ ] **Step 6: Run the test + typecheck**

Run: `pnpm vitest run packages/api/src/discovery/queries.test.ts && pnpm --filter @padel/api typecheck`
Expected: test PASS; typecheck PASS (the `db.rpc('explore_*')` calls resolve against the regenerated types).

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/query-keys.ts packages/api/src/discovery packages/api/src/index.ts
git commit -m "feat(api): discovery explore hooks (rails + see-all)"
```

---

## Task 5: i18n discovery namespace

**Files:**
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add the discovery copy object**

In `apps/mobile/lib/i18n-mobile.ts`, near the other namespace consts (e.g. after `mobileEvent`), add:

```ts
const mobileDiscovery = {
  en: {
    tab: 'Explore',
    railPlayers: 'Players you might know',
    railEvents: 'Events',
    railCommunities: 'Communities',
    railGroups: 'Groups',
    seeAll: 'See all',
    requestToJoin: 'Request to join',
    emptyPlayers: 'No suggestions yet',
    emptyEvents: 'No upcoming events to discover',
    emptyCommunities: 'No communities to discover',
    emptyGroups: 'No groups to discover',
    loadError: 'Could not load suggestions',
    seeAllTitlePlayers: 'Players you might know',
    seeAllTitleEvents: 'Events',
    seeAllTitleCommunities: 'Communities',
    seeAllTitleGroups: 'Groups',
  },
} as const;
```

- [ ] **Step 2: Register the namespace**

In the `registerMobileCopy` function body, add (next to the `group`/`event` registrations):

```ts
  instance.addResourceBundle('en', 'discovery', mobileDiscovery.en, true, false);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck` (or the app's typecheck script; if the app has none, run `pnpm -w typecheck`)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): discovery i18n namespace"
```

---

## Task 6: Explore tab UI (cards, rail, screen, tab registration)

**Files:**
- Create: `apps/mobile/components/explore/SuggestionRail.tsx`
- Create: `apps/mobile/components/explore/CommunityCard.tsx`
- Create: `apps/mobile/components/explore/GroupCard.tsx`
- Create: `apps/mobile/components/explore/PlayerCard.tsx`
- Create: `apps/mobile/app/(tabs)/explore.tsx` (rename of `two.tsx`)
- Delete: `apps/mobile/app/(tabs)/two.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`

- [ ] **Step 1: SuggestionRail (generic horizontal rail)**

Create `apps/mobile/components/explore/SuggestionRail.tsx`:

```tsx
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type Props<T> = {
  title: string;
  seeAllLabel: string;
  onSeeAll: () => void;
  data: T[];
  isLoading: boolean;
  isError: boolean;
  emptyLabel: string;
  errorLabel: string;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactElement;
};

export function SuggestionRail<T>({
  title,
  seeAllLabel,
  onSeeAll,
  data,
  isLoading,
  isError,
  emptyLabel,
  errorLabel,
  keyExtractor,
  renderItem,
}: Props<T>) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.seeAll}>{seeAllLabel}</Text>
        </Pressable>
      </View>
      {isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={styles.state} />
      ) : isError ? (
        <Text style={styles.stateText}>{errorLabel}</Text>
      ) : data.length === 0 ? (
        <Text style={styles.stateText}>{emptyLabel}</Text>
      ) : (
        <FlashList
          horizontal
          data={data}
          keyExtractor={keyExtractor}
          showsHorizontalScrollIndicator={false}
          estimatedItemSize={180}
          ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => renderItem(item)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingVertical: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#0B1F3A' },
  seeAll: { fontSize: 14, fontWeight: '600', color: '#0B7BFF' },
  listContent: { paddingHorizontal: 16 },
  state: { paddingVertical: 16 },
  stateText: { paddingHorizontal: 16, paddingVertical: 12, color: '#6B7685', fontSize: 14 },
});
```

- [ ] **Step 2: CommunityCard**

Create `apps/mobile/components/explore/CommunityCard.tsx`:

```tsx
import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Community = {
  id: string;
  name: string;
  description: string | null;
  privacy: string;
  location: string | null;
};

export function CommunityCard({
  community,
  onOpen,
  onRequestJoin,
}: {
  community: Community;
  onOpen: () => void;
  onRequestJoin: () => void;
}) {
  const { t } = useT('discovery');
  const isRequest = community.privacy === 'request_to_join';
  return (
    <Pressable style={styles.card} onPress={onOpen} accessibilityRole="button">
      <View style={styles.thumb} />
      <Text style={styles.name} numberOfLines={1}>
        {community.name}
      </Text>
      {community.location ? (
        <Text style={styles.meta} numberOfLines={1}>
          {community.location}
        </Text>
      ) : null}
      {isRequest ? (
        <Pressable style={styles.cta} onPress={onRequestJoin} accessibilityRole="button">
          <Text style={styles.ctaText}>{t('requestToJoin')}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 180, backgroundColor: '#fff', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6EAF0', padding: 12, gap: 6 },
  thumb: { height: 80, borderRadius: 10, backgroundColor: '#F0F3F8' },
  name: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  meta: { fontSize: 13, color: '#6B7685' },
  cta: { marginTop: 4, borderRadius: 999, backgroundColor: '#E6F0FF', paddingVertical: 6, alignItems: 'center' },
  ctaText: { fontSize: 13, fontWeight: '700', color: '#0B7BFF' },
});
```

- [ ] **Step 3: GroupCard**

Create `apps/mobile/components/explore/GroupCard.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Group = { id: string; name: string };

export function GroupCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onOpen} accessibilityRole="button">
      <View style={styles.thumb} />
      <Text style={styles.name} numberOfLines={2}>
        {group.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 160, backgroundColor: '#fff', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6EAF0', padding: 12, gap: 6 },
  thumb: { height: 72, borderRadius: 10, backgroundColor: '#F0F3F8' },
  name: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
});
```

- [ ] **Step 4: PlayerCard (tap is a no-op)**

Create `apps/mobile/components/explore/PlayerCard.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

type Player = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  dominant_hand: string | null;
  court_side: string | null;
};

/** Tap is intentionally a no-op until the Profile module + player-profile screen land. */
export function PlayerCard({ player }: { player: Player }) {
  const initials = player.full_name
    .split(' ')
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View style={styles.card} accessibilityRole="image" accessibilityLabel={player.full_name}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {player.full_name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 110, alignItems: 'center', gap: 8, paddingVertical: 8 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E6F0FF', alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 20, fontWeight: '700', color: '#0B7BFF' },
  name: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', textAlign: 'center' },
});
```

- [ ] **Step 5: The Explore tab screen**

Create `apps/mobile/app/(tabs)/explore.tsx`:

```tsx
import {
  useExploreCommunities,
  useExploreEvents,
  useExploreGroups,
  useExplorePlayers,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event/EventCard';
import { CommunityCard } from '@/components/explore/CommunityCard';
import { GroupCard } from '@/components/explore/GroupCard';
import { PlayerCard } from '@/components/explore/PlayerCard';
import { SuggestionRail } from '@/components/explore/SuggestionRail';

export default function ExploreScreen() {
  const { t } = useT('discovery');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const players = useExplorePlayers();
  const events = useExploreEvents();
  const communities = useExploreCommunities();
  const groups = useExploreGroups();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        <SuggestionRail
          title={t('railPlayers')}
          seeAllLabel={t('seeAll')}
          onSeeAll={() => router.push('/explore/players')}
          data={players.data ?? []}
          isLoading={players.isLoading}
          isError={players.isError}
          emptyLabel={t('emptyPlayers')}
          errorLabel={t('loadError')}
          keyExtractor={(p) => p.id}
          renderItem={(p) => <PlayerCard player={p} />}
        />
        <SuggestionRail
          title={t('railEvents')}
          seeAllLabel={t('seeAll')}
          onSeeAll={() => router.push('/explore/events')}
          data={events.data ?? []}
          isLoading={events.isLoading}
          isError={events.isError}
          emptyLabel={t('emptyEvents')}
          errorLabel={t('loadError')}
          keyExtractor={(e) => e.id}
          renderItem={(e) => <EventCard event={e} onPress={() => router.push(`/event/${e.id}`)} />}
        />
        <SuggestionRail
          title={t('railCommunities')}
          seeAllLabel={t('seeAll')}
          onSeeAll={() => router.push('/explore/communities')}
          data={communities.data ?? []}
          isLoading={communities.isLoading}
          isError={communities.isError}
          emptyLabel={t('emptyCommunities')}
          errorLabel={t('loadError')}
          keyExtractor={(c) => c.id}
          renderItem={(c) => (
            <CommunityCard
              community={c}
              onOpen={() => router.push(`/community/${c.id}/posts`)}
              onRequestJoin={() => router.push(`/community/${c.id}/join`)}
            />
          )}
        />
        <SuggestionRail
          title={t('railGroups')}
          seeAllLabel={t('seeAll')}
          onSeeAll={() => router.push('/explore/groups')}
          data={groups.data ?? []}
          isLoading={groups.isLoading}
          isError={groups.isError}
          emptyLabel={t('emptyGroups')}
          errorLabel={t('loadError')}
          keyExtractor={(g) => g.id}
          renderItem={(g) => <GroupCard group={g} onOpen={() => router.push(`/group/${g.id}`)} />}
        />
      </ScrollView>

      {/* Floating Create-Event button. Search icon is deferred (Search plan). */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => router.push('/event/create')}
        accessibilityRole="button"
        accessibilityLabel="Create event"
      >
        <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor="#fff" size={28} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { paddingTop: 8, gap: 8 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0B7BFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
```

> If `EventCard`'s prop type does not accept the `useExploreEvents` element type (both should resolve to the generated `events` Row), widen `EventCard`'s `event` prop in `components/event/EventCard.tsx` to also accept the explore row, OR change the `EventRow` type alias there to `import type { Database } from '@padel/db'` → `Database['public']['Tables']['events']['Row']`. Verify with the Step 8 typecheck before adjusting.

- [ ] **Step 6: Delete the placeholder**

Run: `git rm apps/mobile/app/(tabs)/two.tsx`
Expected: file removed.

- [ ] **Step 7: Register the Explore tab**

In `apps/mobile/app/(tabs)/_layout.tsx`, replace the `name="two"` `<Tabs.Screen>` block (the `Tab Two` one) with:

```tsx
      <Tabs.Screen
        name="explore"
        options={{
          title: t('tab', { ns: 'discovery' }),
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'safari', android: 'explore', web: 'explore' }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
```

(The `t` here is the `community`-namespaced hook already in the file; `t('tab', { ns: 'discovery' })` reads from the discovery namespace. If the project's `useT` does not support per-call `ns`, add `const { t: td } = useT('discovery');` at the top of `TabLayout` and use `td('tab')`.)

- [ ] **Step 8: Typecheck the app**

Run: `pnpm --filter mobile typecheck` (or `pnpm -w typecheck`)
Expected: PASS. Resolve any `EventCard` prop-type mismatch per the Step 5 note.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/components/explore apps/mobile/app/(tabs)/explore.tsx apps/mobile/app/(tabs)/_layout.tsx
git commit -m "feat(mobile): explore tab with four suggestion rails + create-event FAB"
```

---

## Task 7: See-all paged list screen

**Files:**
- Create: `apps/mobile/app/explore/_layout.tsx`
- Create: `apps/mobile/app/explore/[type].tsx`

- [ ] **Step 1: Stack layout for the explore route group**

Create `apps/mobile/app/explore/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function ExploreStackLayout() {
  return <Stack screenOptions={{ headerBackTitle: 'Back' }} />;
}
```

- [ ] **Step 2: The See-all screen**

Create `apps/mobile/app/explore/[type].tsx`:

```tsx
import {
  useExploreCommunitiesList,
  useExploreEventsList,
  useExploreGroupsList,
  useExplorePlayersList,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { EventCard } from '@/components/event/EventCard';
import { CommunityCard } from '@/components/explore/CommunityCard';
import { GroupCard } from '@/components/explore/GroupCard';
import { PlayerCard } from '@/components/explore/PlayerCard';

type ExploreType = 'players' | 'events' | 'communities' | 'groups';

export default function ExploreSeeAllScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const kind = (['players', 'events', 'communities', 'groups'].includes(type ?? '')
    ? type
    : 'communities') as ExploreType;
  const { t } = useT('discovery');
  const router = useRouter();

  // All four hooks are called unconditionally (Rules of Hooks); only the active one is enabled.
  const players = useExplorePlayersList();
  const events = useExploreEventsList();
  const communities = useExploreCommunitiesList();
  const groups = useExploreGroupsList();

  const titleKey = {
    players: 'seeAllTitlePlayers',
    events: 'seeAllTitleEvents',
    communities: 'seeAllTitleCommunities',
    groups: 'seeAllTitleGroups',
  }[kind] as 'seeAllTitlePlayers' | 'seeAllTitleEvents' | 'seeAllTitleCommunities' | 'seeAllTitleGroups';

  const active = { players, events, communities, groups }[kind];
  const rows = (active.data?.pages.flat() ?? []) as ReadonlyArray<{ id: string }>;

  const renderItem = (item: { id: string }) => {
    if (kind === 'players') return <PlayerCard player={item as never} />;
    if (kind === 'events')
      return <EventCard event={item as never} onPress={() => router.push(`/event/${item.id}`)} />;
    if (kind === 'communities')
      return (
        <CommunityCard
          community={item as never}
          onOpen={() => router.push(`/community/${item.id}/posts`)}
          onRequestJoin={() => router.push(`/community/${item.id}/join`)}
        />
      );
    return <GroupCard group={item as never} onOpen={() => router.push(`/group/${item.id}`)} />;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t(titleKey) }} />
      {active.isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={styles.state} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.id}
          numColumns={kind === 'players' ? 3 : 1}
          estimatedItemSize={120}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<Text style={styles.empty}>{t('loadError')}</Text>}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
          }}
          renderItem={({ item }) => renderItem(item)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  list: { padding: 16 },
  state: { paddingVertical: 24 },
  empty: { textAlign: 'center', color: '#6B7685', paddingVertical: 24 },
});
```

> The `item as never` casts bridge the four union row types to each card's concrete prop type; the `kind` guard guarantees the runtime shape matches. This is the one place casts are acceptable — keep them confined here.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck` (or `pnpm -w typecheck`)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/explore
git commit -m "feat(mobile): explore see-all paged list screen"
```

---

## Task 8: Full verification & finish

**Files:** none (verification only)

- [ ] **Step 1: Fresh DB + all SQL tests**

Run:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset
for f in explore_communities explore_groups explore_events explore_players; do
  echo "== $f =="; docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/$f.sql
done
```
Expected: four `OK explore_*` notices, no errors.

- [ ] **Step 2: Types are current (no drift)**

Run: `pnpm dlx supabase@latest --workdir infra gen types typescript --local > packages/db/src/database.types.ts && git diff --stat packages/db/src/database.types.ts`
Expected: little/no change (already regenerated in Task 3).

- [ ] **Step 3: Unit tests + typecheck across the workspace**

Run: `pnpm vitest run packages/api && pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 4: Manual smoke (device/simulator)**

Run the app (`pnpm --filter mobile start` or the project's run command). Verify:
- The **Explore** tab appears in the bottom nav with the compass icon.
- Up to four rails render (or show empty/loer states with seeded data).
- "See all" on each rail opens the paged list and scrolling loads more.
- Tapping a community card opens `/community/[id]/posts`; a request-to-join card's CTA opens `/community/[id]/join`; an event opens `/event/[id]`; a group opens `/group/[id]`; a **player card does nothing** (expected).
- The **Create-Event FAB** opens the `/event/create` wizard. (OPEN ITEM from the spec: confirm the wizard opens cleanly without a group context. If it crashes/dead-ends, change the FAB target to a group-pick entry and note it for the Search/Home plan — do not expand scope here.)

- [ ] **Step 5: Finish the branch**

Announce: "I'm using the finishing-a-development-branch skill to complete this work." Then follow superpowers:finishing-a-development-branch (verify tests, present merge/PR options, execute the choice).

---

## Self-Review notes (addressed)

- **Spec coverage:** Explore tab (DS-01/02/03), four rails + See-all (DS-02/20), visibility incl. request_to_join surfaced (DS-17), tap navigates (DS-18), ranking signals (DS-19) — all mapped to Tasks 1/4/6/7. Search-only DS items (04–16) are out of scope by decision.
- **Type consistency:** RPC names `explore_communities/_groups/_events/_players` and hook names `useExplore{Communities,Groups,Events,Players}[List]` are used identically across Tasks 1, 3, 4, 6, 7. Query keys match between `query-keys.ts` (Task 4 Step 1) and the test (Task 4 Step 2).
- **No placeholders:** every code/SQL/command step is complete. The two judgement calls (EventCard prop type; FAB standalone target) are flagged inline with concrete resolution steps.
- **Distance/Search:** explicitly excluded; no geo columns or `recent_searches` introduced.
```
