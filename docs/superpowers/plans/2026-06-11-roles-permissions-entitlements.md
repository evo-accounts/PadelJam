# Roles, Permissions & Entitlements (Spec 03) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Padel Jam's authorization core — CASL role+scope permissions, a DB-backed two-dimension entitlement system (account Jammer+ / community tiers with numeric limits), and a two-check `authorize()` helper — and enforce it server-side (RLS + cap triggers) on the paths that exist today.

**Architecture:** A typed entitlement registry (`@padel/features`) is the source of truth for plan/feature/limit keys; it is mirrored into DB catalog tables (`plans`/`plan_features`/`plan_limits`) and resolved via SQL functions with safe defaults. Numeric caps are enforced by `SECURITY DEFINER` BEFORE-INSERT/UPDATE triggers (race-safe via per-community advisory locks), never inline RLS. CASL (`@padel/permissions`) turns a *resolved* auth context (tenant role + community role + per-community permission toggles) into an ability, as a pure function usable on client and server. `@padel/authz` composes the entitlement check + the CASL check into one `authorize()` for Edge Function/RPC business actions; RLS + triggers are the data-access backstop.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, triggers, RPCs), `@casl/ability`, TypeScript (strict), Zod-free typed registry, Vitest, local Supabase via `pnpm dlx supabase@latest --workdir infra`.

---

## Context

This implements **Structure Files spec 03** ("Roles, permissions & entitlements — the authorization core; everything later depends on it"), reconciled to Padel Jam's **actual pricing model** and the **hybrid tenant-above-community** decision from the foundation work.

**Why the reconciliation:** spec 03 as written assumes a single-dimension `starter/pro/enterprise` plan→feature matrix. Padel Jam's pricing (`Pricing Model/`) is **two independent dimensions**:
- **Account tier** (per user): `free` (Jammer) vs `jammer_plus` (€4.99/mo, 7-day trial). Features: `unlimited_match_history`, `advanced_stats`, `ad_free`, `custom_icon`.
- **Community tier** (per community): `starter` (free) / `basic` (€9.99) / `community_pro` (€24.99) / `club` (€79.99, post-MVP). Boolean features (`custom_broadcasts`, `priority_support`, `jammer_plus_included`, …) **and numeric limits** (members 10/50/250/∞, groups 1/3/∞/∞, recurring events 1/5/∞/∞, co-organizers 0/1/3/∞).

**Plan-name mapping (spec 03 → this plan):** `starter→starter`, `pro→community_pro`, `enterprise→club`; plus account `free/jammer_plus` which spec 03 lacked. Use the pricing names.

**Decisions made with the user:**
1. Build the Padel Jam **2-dimension** entitlement model (account + community, with numeric limits).
2. **Core + wire existing paths**: build the full authorization core AND retrofit enforcement into paths that exist today (community/group/member creation caps; extend `create_community_with_personal_tenant`). Defer checks for tables that don't exist (events/posts).
3. **Full registry, enforce MVP only**: seed the complete matrix (MVP + Next/post-MVP keys) as the single source of truth; only enforce MVP-scoped keys/limits server-side now (`mvp` flag).
4. **General group COUNTS** toward `groups_per_community` (Starter=1 → only the general group; Basic=3 → general + 2). The general group always inserts because it is the first group and every tier's limit ≥ 1.
5. **Starter is owner-only** (`co_organizers=0` enforced — no admins until Basic+).

**What exists already** (foundation, do not rebuild): monorepo with `@padel/{config,db,auth,i18n,utils}` (real) and `@padel/{permissions,features,authz?…}` placeholders; Supabase migrations `0001`–`0009`; tables `tenants`, `tenant_memberships`, `profiles`, `communities(tenant_id)`, `community_members(role owner|admin|member)`, `groups(is_general)`, `group_members`; helpers `auth_tenant_ids()`, `is_community_admin(c)`; RPC `create_community_with_personal_tenant(...)`; the public-discovery RLS escape hatch. Generated DB types in `packages/db/src/database.types.ts` expose RPCs as `client.rpc(name, args)`. See `~/.claude/projects/.../memory/project-hybrid-model.md` and `supabase-local-setup.md`.

**Out of scope (later plans):** events/posts/reviews tables (and their entitlement gates — `recurring_events` limit is seeded but inert), billing webhooks (spec 09 — `subscriptions.provider/status/current_period_end` are shaped for it), PostHog rollout flags (never gate plans).

**Conventions to follow:** migrations are sequential additive SQL `infra/supabase/migrations/NNNN_name.sql` (next is `0010`); helper fns are `language sql|plpgsql stable security definer set search_path = public`; run Supabase via `pnpm dlx supabase@latest --workdir infra` after `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token`; regenerate types after every migration; packages export raw TS from `src/index.ts`, strict TS (`import type`, `noUncheckedIndexedAccess`).

---

## File Structure

```
infra/supabase/migrations/
  0010_plans.sql                  plans / plan_features / plan_limits catalog + enums
  0011_subscriptions.sql          subscriptions (per user) + community_subscriptions (per community)
  0012_community_permissions.sql  per-community member-permission toggles + RLS
  0013_seed_plans.sql             full plan matrix seed (MVP + Next), mvp flags
  0014_entitlement_fns.sql        community_plan/account_plan/*_has_feature/community_limit resolvers
  0015_limit_triggers.sql         member/co-organizer/group cap triggers (advisory-locked)
  0016_wire_defaults.sql          extend create_community_with_personal_tenant (permissions row)
packages/features/src/
  registry.ts        PLAN_MATRIX + Feature/Limit/Plan unions + MVP_FEATURES (source of truth)
  entitlements.ts    hasFeature/hasAccountFeature/getLimit (typed RPC wrappers)
  index.ts
  registry.test.ts   pure: matrix shape, MVP filter
packages/permissions/src/
  subjects.ts        Action/Subject unions
  context.ts         AuthContext (resolved input) + TenantRole/CommunityRole
  ability.ts         abilityFor(ctx) -> Ability, pure
  index.ts
  ability.test.ts    role×action×subject truth table + toggle grants
packages/authz/        (NEW package @padel/authz)
  package.json tsconfig.json
  src/authorize.ts   authorize({...}) two-check helper
  src/index.ts
  src/authorize.test.ts
infra/supabase/tests/  (psql integration scripts run via docker exec — see Task 12)
```

---

# PART A — Schema, seed & resolution

### Task 1: Catalog tables (plans / features / limits)

**Files:** Create `infra/supabase/migrations/0010_plans.sql`

- [ ] **Step 1: Write `0010_plans.sql`**

```sql
create type plan_dimension as enum ('account','community');
create type subscription_provider as enum ('stripe','revenuecat','manual');
create type subscription_status as enum ('trialing','active','past_due','canceled','incomplete');

create table plans (
  dimension   plan_dimension not null,
  plan_id     text not null,
  name        text not null,
  price_cents integer not null default 0,
  currency    text not null default 'EUR',
  sort_order  integer not null default 0,
  is_default  boolean not null default false,
  mvp         boolean not null default false,
  primary key (dimension, plan_id)
);

create table plan_features (
  dimension   plan_dimension not null,
  plan_id     text not null,
  feature_key text not null,
  mvp         boolean not null default false,
  primary key (dimension, plan_id, feature_key),
  foreign key (dimension, plan_id) references plans(dimension, plan_id) on delete cascade
);

-- community-dimension only; pinned dimension column keeps a clean composite FK.
create table plan_limits (
  dimension plan_dimension not null default 'community' check (dimension = 'community'),
  plan_id   text not null,
  limit_key text not null,
  value     integer,                       -- NULL = unlimited
  mvp       boolean not null default false,
  primary key (plan_id, limit_key),
  foreign key (dimension, plan_id) references plans(dimension, plan_id) on delete cascade
);

-- Catalog is public-readable (it is product config, not user data); writes are migration/seed only.
alter table plans enable row level security;
alter table plan_features enable row level security;
alter table plan_limits enable row level security;
create policy "plans: read all"         on plans         for select using (true);
create policy "plan_features: read all" on plan_features for select using (true);
create policy "plan_limits: read all"   on plan_limits   for select using (true);
```

- [ ] **Step 2: Apply and verify the migration**

Run: `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`
Expected: applies `…0010_plans.sql…` with no error; `Finished supabase db reset`.

- [ ] **Step 3: Verify tables + RLS exist**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -c "\dt plan*" -c "select relrowsecurity from pg_class where relname='plans';"`
Expected: `plans`, `plan_features`, `plan_limits` listed; `relrowsecurity = t`.

---

### Task 2: Subscription tables

**Files:** Create `infra/supabase/migrations/0011_subscriptions.sql`

- [ ] **Step 1: Write `0011_subscriptions.sql`**

```sql
create table subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  dimension          plan_dimension not null default 'account' check (dimension = 'account'),
  plan_id            text not null,
  status             subscription_status not null default 'active',
  provider           subscription_provider not null default 'manual',
  provider_ref       text,
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id),
  foreign key (dimension, plan_id) references plans(dimension, plan_id)
);

create table community_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  community_id       uuid not null references communities(id) on delete cascade,
  dimension          plan_dimension not null default 'community' check (dimension = 'community'),
  plan_id            text not null,
  status             subscription_status not null default 'active',
  provider           subscription_provider not null default 'manual',
  provider_ref       text,
  current_period_end timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (community_id),
  foreign key (dimension, plan_id) references plans(dimension, plan_id)
);

alter table subscriptions enable row level security;
alter table community_subscriptions enable row level security;

-- Read your own account subscription; read a community's subscription if you can see the community.
-- No client INSERT/UPDATE policies: subscriptions are written by seed/admin/service-role only
-- (billing webhooks become the sole writer in spec 09), mirroring the profiles server-only decision.
create policy "subscriptions: read own" on subscriptions for select using (user_id = auth.uid());
create policy "community_subscriptions: read" on community_subscriptions for select using (
  community_id in (
    select id from communities where tenant_id in (select auth_tenant_ids()) or privacy = 'public'
  )
);
```

- [ ] **Step 2: Apply + verify**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Expected: `…0011_subscriptions.sql…` applies; `Finished`.
Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -c "\d subscriptions"`
Expected: shows the `dimension` CHECK and the composite FK to `plans`.

---

### Task 3: Per-community permission toggles

**Files:** Create `infra/supabase/migrations/0012_community_permissions.sql`

- [ ] **Step 1: Write `0012_community_permissions.sql`**

```sql
-- Member-grantable capability toggles only. Admin-only actions (create groups / create events)
-- are NEVER columns here — they are enforced purely by community role.
create table community_permissions (
  community_id          uuid primary key references communities(id) on delete cascade,
  invite_members        boolean not null default false,
  approve_join_requests boolean not null default false,
  create_posts          boolean not null default false,
  updated_at            timestamptz not null default now()
);

alter table community_permissions enable row level security;
create policy "community_permissions: read" on community_permissions for select using (
  community_id in (
    select id from communities where tenant_id in (select auth_tenant_ids()) or privacy = 'public'
  )
);
create policy "community_permissions: write" on community_permissions for all
  using (is_community_admin(community_id)) with check (is_community_admin(community_id));
```

- [ ] **Step 2: Apply + verify RLS isolation**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Then:
```bash
docker exec -i supabase_db_padeljam psql -U postgres -d postgres <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
-- a random user cannot write toggles for a community they don't admin
insert into community_permissions (community_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
rollback;
SQL
```
Expected: `ERROR: new row violates row-level security policy for table "community_permissions"`.

---

### Task 4: Seed the full plan matrix

**Files:** Create `infra/supabase/migrations/0013_seed_plans.sql`

- [ ] **Step 1: Write `0013_seed_plans.sql`** (full matrix; `mvp=true` rows are enforced now)

```sql
-- Plans
insert into plans (dimension, plan_id, name, price_cents, currency, sort_order, is_default, mvp) values
  ('account','free','Jammer',0,'EUR',0,true,true),
  ('account','jammer_plus','Jammer+',499,'EUR',1,false,true),
  ('community','starter','Starter',0,'EUR',0,true,true),
  ('community','basic','Basic',999,'EUR',1,false,true),
  ('community','community_pro','Community Pro',2499,'EUR',2,false,true),
  ('community','club','Club',7999,'EUR',3,false,false);

-- Account features (mvp)
insert into plan_features (dimension, plan_id, feature_key, mvp) values
  ('account','jammer_plus','unlimited_match_history',true),
  ('account','jammer_plus','advanced_stats',true),
  ('account','jammer_plus','ad_free',true),
  ('account','jammer_plus','custom_icon',true);
-- Account features (next/post-mvp, seeded but inert)
insert into plan_features (dimension, plan_id, feature_key, mvp) values
  ('account','jammer_plus','match_insights',false),
  ('account','jammer_plus','custom_rivalries',false),
  ('account','jammer_plus','exclusive_avatar_items',false),
  ('account','jammer_plus','waiting_list_priority',false),
  ('account','jammer_plus','badges_xp',false),
  ('account','jammer_plus','home_club',false);

-- Community features (mvp): event_management/community_feed/discoverability on ALL tiers
insert into plan_features (dimension, plan_id, feature_key, mvp)
select 'community', p.plan_id, f.k, true
from (values ('starter'),('basic'),('community_pro'),('club')) p(plan_id),
     (values ('event_management'),('community_feed'),('discoverability')) f(k);
-- custom_broadcasts on basic+; priority_support on pro+; jammer_plus_included on basic+
insert into plan_features (dimension, plan_id, feature_key, mvp) values
  ('community','basic','custom_broadcasts',true),
  ('community','community_pro','custom_broadcasts',true),
  ('community','club','custom_broadcasts',true),
  ('community','community_pro','priority_support',true),
  ('community','club','priority_support',true),
  ('community','basic','jammer_plus_included',true),
  ('community','community_pro','jammer_plus_included',true),
  ('community','club','jammer_plus_included',true);
-- Community features (next/post-mvp, inert)
insert into plan_features (dimension, plan_id, feature_key, mvp) values
  ('community','basic','analytics_basic',false),
  ('community','community_pro','analytics_pro',false),
  ('community','community_pro','paid_events',false),
  ('community','community_pro','coach_mode',false),
  ('community','community_pro','custom_url',false),
  ('community','club','multiple_communities',false),
  ('community','club','staff_accounts',false),
  ('community','club','api_access',false),
  ('community','club','tournament_management',false);

-- Community numeric limits (mvp). value NULL = unlimited.
insert into plan_limits (plan_id, limit_key, value, mvp) values
  ('starter','members_per_community',10,true),
  ('basic','members_per_community',50,true),
  ('community_pro','members_per_community',250,true),
  ('club','members_per_community',null,true),
  ('starter','groups_per_community',1,true),
  ('basic','groups_per_community',3,true),
  ('community_pro','groups_per_community',null,true),
  ('club','groups_per_community',null,true),
  ('starter','recurring_events',1,true),
  ('basic','recurring_events',5,true),
  ('community_pro','recurring_events',null,true),
  ('club','recurring_events',null,true),
  ('starter','co_organizers',0,true),
  ('basic','co_organizers',1,true),
  ('community_pro','co_organizers',3,true),
  ('club','co_organizers',null,true);
```

- [ ] **Step 2: Apply + verify counts**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -tc "select (select count(*) from plans) plans, (select count(*) from plan_features) feats, (select count(*) from plan_limits) limits;"`
Expected: `plans=6`, and `limits=16`. (`feats` = 4+6 account + 12 community-all (3×4) + 8 + 9 = 39.)

---

### Task 5: Entitlement resolver functions

**Files:** Create `infra/supabase/migrations/0014_entitlement_fns.sql`

- [ ] **Step 1: Write `0014_entitlement_fns.sql`**

```sql
create or replace function community_plan(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select cs.plan_id from community_subscriptions cs
       where cs.community_id = c and cs.status in ('trialing','active')),
    'starter');
$$;

create or replace function community_has_feature(c uuid, key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from plan_features
    where dimension = 'community' and plan_id = community_plan(c) and feature_key = key);
$$;

-- Effective account plan: a real jammer_plus subscription OR a derived grant from owning a
-- community on a plan with jammer_plus_included. Read-time derivation, no stored row.
create or replace function account_plan(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from subscriptions s
      where s.user_id = u and s.plan_id = 'jammer_plus' and s.status in ('trialing','active')
    ) then 'jammer_plus'
    when exists (
      select 1 from community_members cm
      where cm.user_id = u and cm.role = 'owner'
        and community_has_feature(cm.community_id, 'jammer_plus_included')
    ) then 'jammer_plus'
    else 'free'
  end;
$$;

create or replace function account_has_feature(u uuid, key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from plan_features
    where dimension = 'account' and plan_id = account_plan(u) and feature_key = key);
$$;

create or replace function community_limit(c uuid, key text) returns integer
language sql stable security definer set search_path = public as $$
  select value from plan_limits where plan_id = community_plan(c) and limit_key = key;
$$;
```

- [ ] **Step 2: Apply + verify resolver defaults**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Run:
```bash
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -tc "
select community_plan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as plan,
       community_limit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','members_per_community') as members_cap,
       community_has_feature('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','custom_broadcasts') as has_custom_broadcasts;"
```
Expected: `starter | 10 | f` (the seeded community has no subscription row → defaults to starter).

---

### Task 6: Numeric cap triggers (the security-critical enforcement)

**Files:** Create `infra/supabase/migrations/0015_limit_triggers.sql`

- [ ] **Step 1: Write `0015_limit_triggers.sql`** (SECURITY DEFINER + per-community advisory lock; counts the true total, immune to RLS visibility truncation)

```sql
-- Members + co-organizer caps on community_members (INSERT: member cap + admin co-org; UPDATE: promotion).
create or replace function enforce_member_caps() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('cmember_cap:' || NEW.community_id::text, 0));

  if TG_OP = 'INSERT' then
    v_limit := community_limit(NEW.community_id, 'members_per_community');
    if v_limit is not null then
      select count(*) into v_count from community_members where community_id = NEW.community_id;
      if v_count >= v_limit then
        raise exception 'members_per_community limit reached (%)', v_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  if NEW.role = 'admin' and (TG_OP = 'INSERT' or OLD.role is distinct from 'admin') then
    v_limit := community_limit(NEW.community_id, 'co_organizers');
    if v_limit is not null then
      select count(*) into v_count from community_members
        where community_id = NEW.community_id and role = 'admin';
      if v_count >= v_limit then
        raise exception 'co_organizers limit reached (%)', v_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  return NEW;
end; $$;
create trigger trg_member_caps before insert or update on community_members
  for each row execute function enforce_member_caps();

-- Groups cap on groups (general group counts; it always fits since every tier limit >= 1).
create or replace function enforce_group_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('group_cap:' || NEW.community_id::text, 0));
  v_limit := community_limit(NEW.community_id, 'groups_per_community');
  if v_limit is null then return NEW; end if;
  select count(*) into v_count from groups where community_id = NEW.community_id;
  if v_count >= v_limit then
    raise exception 'groups_per_community limit reached (%)', v_limit using errcode = 'P0001';
  end if;
  return NEW;
end; $$;
create trigger trg_group_cap before insert on groups
  for each row execute function enforce_group_cap();
```

- [ ] **Step 2: Apply + verify the general group + owner still insert (RPC unaffected)**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Then exercise the existing creation RPC as a seeded user and confirm it still succeeds (community + general group + owner all fit under starter caps):
```bash
docker exec -i supabase_db_padeljam psql -U postgres -d postgres <<'SQL'
begin;
insert into auth.users (id, instance_id, aud, role, email)
  values ('77777777-7777-7777-7777-777777777777','00000000-0000-0000-0000-000000000000','authenticated','authenticated','capowner@example.com')
  on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
select create_community_with_personal_tenant('Cap Test','friends','PT') as cid;
rollback;
SQL
```
Expected: returns a UUID with no cap error (general group is the 1st group → 0 < 1 ok; owner is the 1st member → 0 < 10 ok).

---

### Task 7: Cap-enforcement integration test (starter limits bite)

**Files:** Create `infra/supabase/tests/caps.sql`

- [ ] **Step 1: Write `infra/supabase/tests/caps.sql`** (drives a real starter community to its limits)

```sql
-- Build a starter community owned by a test user, then prove each cap blocks.
-- IMPORTANT: the triggers raise SQLSTATE 'P0001'. The "expected to block" sentinel uses a DISTINCT
-- code 'PT001' so the `when sqlstate 'P0001'` handler can never swallow a real failure.
begin;
insert into auth.users (id, instance_id, aud, role, email)
  values ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-000000000000','authenticated','authenticated','capx@example.com')
  on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';

select create_community_with_personal_tenant('Caps','friends','PT') as cid \gset
set local role postgres;  -- bypass RLS for the test fixtures; triggers still fire

-- GROUPS CAP (starter = 1, general already exists): a 2nd group must fail.
do $$
declare cid uuid := (select id from communities where name='Caps' order by created_at desc limit 1);
begin
  begin
    insert into groups (community_id, name) values (cid, 'Second Group');
    raise exception using errcode='PT001', message='EXPECTED groups cap to block, but insert succeeded';
  exception when sqlstate 'P0001' then
    raise notice 'OK groups cap blocked: %', sqlerrm;
  end;
end $$;

-- CO-ORGANIZER CAP (starter = 0): promoting any member to admin must fail.
do $$
declare
  cid  uuid := (select id from communities where name='Caps' order by created_at desc limit 1);
  muid uuid := '00000000-0000-0000-0000-0000000000aa';
begin
  insert into auth.users (id, instance_id, aud, role)
    values (muid, '00000000-0000-0000-0000-000000000000','authenticated','authenticated')
    on conflict do nothing;
  insert into community_members (community_id, user_id, role) values (cid, muid, 'member'); -- member cap: 1<10 ok
  begin
    update community_members set role='admin' where community_id=cid and user_id=muid;
    raise exception using errcode='PT001', message='EXPECTED co_organizers cap to block promotion, but it succeeded';
  exception when sqlstate 'P0001' then
    raise notice 'OK co_organizers cap blocked: %', sqlerrm;
  end;
end $$;

rollback;
```

(The member-cap-at-10 path uses the same trigger; this script proves the two caps that bite at low numbers — groups=1 and co_organizers=0 on starter. A real failure raises `PT001`, which is uncaught and aborts the script under `ON_ERROR_STOP=1`.)

- [ ] **Step 2: Run the integration test**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < infra/supabase/tests/caps.sql`
Expected: two `NOTICE: OK ... blocked` lines, no `EXPECTED ...` exception. (If an `EXPECTED` exception fires, the cap is not enforcing — fix the trigger.)

- [ ] **Step 3: Commit Part A**

```bash
git add infra/supabase/migrations/0010_plans.sql infra/supabase/migrations/0011_subscriptions.sql infra/supabase/migrations/0012_community_permissions.sql infra/supabase/migrations/0013_seed_plans.sql infra/supabase/migrations/0014_entitlement_fns.sql infra/supabase/migrations/0015_limit_triggers.sql infra/supabase/tests/caps.sql
git commit -m "feat(entitlements): plan/feature/limit schema, resolvers, and race-safe cap triggers"
```

---

# PART B — `@padel/features` registry + resolvers

### Task 8: Regenerate DB types (new RPCs become typed)

**Files:** Modify `packages/db/src/database.types.ts` (generated)

- [ ] **Step 1: Regenerate**

Run: `pnpm dlx supabase@latest --workdir infra gen types typescript --local > packages/db/src/database.types.ts`

- [ ] **Step 2: Verify the new RPCs are typed**

Run: `grep -E "community_has_feature|account_has_feature|community_limit|community_plan|account_plan" packages/db/src/database.types.ts | head`
Expected: each function appears under `Functions`.
Run: `pnpm --filter @padel/db typecheck`
Expected: clean.

---

### Task 9: Registry — the typed source of truth (TDD)

**Files:** Create `packages/features/src/registry.ts`, `packages/features/src/registry.test.ts`; modify `packages/features/package.json`

- [ ] **Step 1: Add vitest to `packages/features/package.json`**

Add `"test": "vitest run"` to scripts and `"vitest": "^2.1.0"` to devDependencies; add `"@padel/db": "workspace:*"` to dependencies. Run `pnpm install`.

- [ ] **Step 2: Write the failing test — `registry.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { PLAN_MATRIX, isMvpFeature, COMMUNITY_FEATURES, LIMIT_KEYS } from './registry';

describe('registry', () => {
  it('marks starter as the default community plan with a members limit of 10', () => {
    const starter = PLAN_MATRIX.find((p) => p.dimension === 'community' && p.id === 'starter');
    expect(starter?.isDefault).toBe(true);
    expect(starter?.limits?.members_per_community).toBe(10);
  });
  it('treats unlimited (club groups) as null', () => {
    const club = PLAN_MATRIX.find((p) => p.id === 'club');
    expect(club?.limits?.groups_per_community).toBeNull();
  });
  it('enforces advanced_stats (mvp) but not match_insights (next)', () => {
    expect(isMvpFeature('advanced_stats')).toBe(true);
    expect(isMvpFeature('match_insights')).toBe(false);
  });
  it('exposes the four community limit keys', () => {
    expect([...LIMIT_KEYS].sort()).toEqual(
      ['co_organizers', 'groups_per_community', 'members_per_community', 'recurring_events'].sort(),
    );
    expect(COMMUNITY_FEATURES).toContain('custom_broadcasts');
  });
});
```

- [ ] **Step 3: Run — verify fail.** Run: `pnpm --filter @padel/features test` → FAIL (no `./registry`).

- [ ] **Step 4: Implement `registry.ts`** (mirror the seed exactly — this is the sync contract)

```ts
export const PLAN_IDS = {
  account: ['free', 'jammer_plus'],
  community: ['starter', 'basic', 'community_pro', 'club'],
} as const;
export type AccountPlanId = (typeof PLAN_IDS.account)[number];
export type CommunityPlanId = (typeof PLAN_IDS.community)[number];

export const ACCOUNT_FEATURES = [
  'unlimited_match_history', 'advanced_stats', 'ad_free', 'custom_icon',
  'match_insights', 'custom_rivalries', 'exclusive_avatar_items', 'waiting_list_priority',
  'badges_xp', 'home_club',
] as const;
export const COMMUNITY_FEATURES = [
  'event_management', 'community_feed', 'discoverability', 'custom_broadcasts',
  'priority_support', 'jammer_plus_included', 'analytics_basic', 'analytics_pro',
  'paid_events', 'coach_mode', 'custom_url', 'multiple_communities', 'staff_accounts',
  'api_access', 'tournament_management',
] as const;
export const LIMIT_KEYS = [
  'members_per_community', 'groups_per_community', 'recurring_events', 'co_organizers',
] as const;

export type AccountFeatureKey = (typeof ACCOUNT_FEATURES)[number];
export type CommunityFeatureKey = (typeof COMMUNITY_FEATURES)[number];
export type LimitKey = (typeof LIMIT_KEYS)[number];

export interface PlanDef {
  id: string;
  dimension: 'account' | 'community';
  isDefault: boolean;
  mvp: boolean;
  features: readonly { key: string; mvp: boolean }[];
  limits?: Partial<Record<LimitKey, number | null>>;
}

export const PLAN_MATRIX: readonly PlanDef[] = [
  { id: 'free', dimension: 'account', isDefault: true, mvp: true, features: [] },
  {
    id: 'jammer_plus', dimension: 'account', isDefault: false, mvp: true,
    features: [
      { key: 'unlimited_match_history', mvp: true }, { key: 'advanced_stats', mvp: true },
      { key: 'ad_free', mvp: true }, { key: 'custom_icon', mvp: true },
      { key: 'match_insights', mvp: false }, { key: 'custom_rivalries', mvp: false },
      { key: 'exclusive_avatar_items', mvp: false }, { key: 'waiting_list_priority', mvp: false },
      { key: 'badges_xp', mvp: false }, { key: 'home_club', mvp: false },
    ],
  },
  {
    id: 'starter', dimension: 'community', isDefault: true, mvp: true,
    features: [
      { key: 'event_management', mvp: true }, { key: 'community_feed', mvp: true },
      { key: 'discoverability', mvp: true },
    ],
    limits: { members_per_community: 10, groups_per_community: 1, recurring_events: 1, co_organizers: 0 },
  },
  {
    id: 'basic', dimension: 'community', isDefault: false, mvp: true,
    features: [
      { key: 'event_management', mvp: true }, { key: 'community_feed', mvp: true },
      { key: 'discoverability', mvp: true }, { key: 'custom_broadcasts', mvp: true },
      { key: 'jammer_plus_included', mvp: true }, { key: 'analytics_basic', mvp: false },
    ],
    limits: { members_per_community: 50, groups_per_community: 3, recurring_events: 5, co_organizers: 1 },
  },
  {
    id: 'community_pro', dimension: 'community', isDefault: false, mvp: true,
    features: [
      { key: 'event_management', mvp: true }, { key: 'community_feed', mvp: true },
      { key: 'discoverability', mvp: true }, { key: 'custom_broadcasts', mvp: true },
      { key: 'priority_support', mvp: true }, { key: 'jammer_plus_included', mvp: true },
      { key: 'analytics_pro', mvp: false }, { key: 'paid_events', mvp: false },
      { key: 'coach_mode', mvp: false }, { key: 'custom_url', mvp: false },
    ],
    limits: { members_per_community: 250, groups_per_community: null, recurring_events: null, co_organizers: 3 },
  },
  {
    id: 'club', dimension: 'community', isDefault: false, mvp: false,
    features: [
      { key: 'event_management', mvp: true }, { key: 'community_feed', mvp: true },
      { key: 'discoverability', mvp: true }, { key: 'custom_broadcasts', mvp: true },
      { key: 'priority_support', mvp: true }, { key: 'jammer_plus_included', mvp: true },
      { key: 'multiple_communities', mvp: false }, { key: 'staff_accounts', mvp: false },
      { key: 'api_access', mvp: false }, { key: 'tournament_management', mvp: false },
    ],
    limits: { members_per_community: null, groups_per_community: null, recurring_events: null, co_organizers: null },
  },
];

export const MVP_FEATURES: ReadonlySet<string> = new Set(
  PLAN_MATRIX.flatMap((p) => p.features.filter((f) => f.mvp).map((f) => f.key)),
);
export const isMvpFeature = (key: string): boolean => MVP_FEATURES.has(key);
```

- [ ] **Step 5: Run — verify pass.** Run: `pnpm --filter @padel/features test` → 4 passing. Run: `pnpm --filter @padel/features typecheck` → clean.

---

### Task 10: Entitlement resolver wrappers

**Files:** Create `packages/features/src/entitlements.ts`; replace `packages/features/src/index.ts`

- [ ] **Step 1: Implement `entitlements.ts`** (thin typed RPC wrappers; defaults live in SQL)

```ts
import type { TypedClient } from '@padel/db';
import type { AccountFeatureKey, CommunityFeatureKey, LimitKey } from './registry';

export const hasFeature = async (
  client: TypedClient, communityId: string, key: CommunityFeatureKey,
): Promise<boolean> => {
  const { data } = await client.rpc('community_has_feature', { c: communityId, key });
  return data ?? false;
};

export const hasAccountFeature = async (
  client: TypedClient, userId: string, key: AccountFeatureKey,
): Promise<boolean> => {
  const { data } = await client.rpc('account_has_feature', { u: userId, key });
  return data ?? false;
};

export const getLimit = async (
  client: TypedClient, communityId: string, key: LimitKey,
): Promise<number | null> => {
  const { data } = await client.rpc('community_limit', { c: communityId, key });
  return data ?? null;
};
```

- [ ] **Step 2: Replace `index.ts`**

```ts
export * from './registry';
export * from './entitlements';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @padel/features typecheck`
Expected: clean (RPC arg names `c`/`u`/`key` match the generated types from Task 8).

- [ ] **Step 4: Commit Part B**

```bash
git add packages/features packages/db/src/database.types.ts
git commit -m "feat(features): typed entitlement registry + RPC-backed hasFeature/getLimit resolvers"
```

---

# PART C — `@padel/permissions` (CASL)

### Task 11: Subjects + resolved auth context

**Files:** Create `packages/permissions/src/subjects.ts`, `packages/permissions/src/context.ts`; modify `packages/permissions/package.json`

- [ ] **Step 1: Add CASL + vitest to `packages/permissions/package.json`**

Add dependencies `"@casl/ability": "^6.7.0"`; devDependencies `"vitest": "^2.1.0"`. Run `pnpm install`.

- [ ] **Step 2: `subjects.ts`**

```ts
export const ACTIONS = ['create', 'read', 'update', 'delete', 'manage'] as const;
export type Action = (typeof ACTIONS)[number];

export const SUBJECTS = [
  'Community', 'Group', 'Event', 'Post', 'Member', 'JoinRequest', 'Payment',
  'Analytics', 'Broadcast', 'all',
] as const;
export type Subject = (typeof SUBJECTS)[number];
```

- [ ] **Step 3: `context.ts`** (the RESOLVED input — keeps `abilityFor` pure)

```ts
export type TenantRole =
  | 'member' | 'coach' | 'staff' | 'community_owner' | 'club_owner' | 'super_admin';
export type CommunityRole = 'owner' | 'admin' | 'member';

export interface CommunityPermissionToggles {
  invite_members: boolean;
  approve_join_requests: boolean;
  create_posts: boolean;
}

export interface AuthContext {
  userId: string;
  tenantRoles: { tenantId: string; role: TenantRole }[];
  /** The community currently in scope (the user's role in it), if any. */
  communityRole?: { communityId: string; role: CommunityRole };
  /** The member-permission toggles for that community. */
  communityPermissions?: CommunityPermissionToggles;
}
```

---

### Task 12: `abilityFor` (TDD — the permission truth table)

**Files:** Create `packages/permissions/src/ability.ts`, `packages/permissions/src/ability.test.ts`; replace `packages/permissions/src/index.ts`

- [ ] **Step 1: Write the failing test — `ability.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { abilityFor } from './ability';
import type { AuthContext } from './context';

const base = (over: Partial<AuthContext>): AuthContext => ({
  userId: 'u1', tenantRoles: [], ...over,
});
const C = 'c1';

describe('abilityFor', () => {
  it('super_admin can manage everything', () => {
    const a = abilityFor(base({ tenantRoles: [{ tenantId: 't1', role: 'super_admin' }] }));
    expect(a.can('manage', 'all')).toBe(true);
  });

  it('community owner can create a group in their community', () => {
    const a = abilityFor(base({ communityRole: { communityId: C, role: 'owner' } }));
    expect(a.can('create', 'Group')).toBe(true);
    expect(a.can('delete', 'Community')).toBe(true);
  });

  it('community admin can create groups but cannot delete the community', () => {
    const a = abilityFor(base({ communityRole: { communityId: C, role: 'admin' } }));
    expect(a.can('create', 'Group')).toBe(true);
    expect(a.can('delete', 'Community')).toBe(false);
  });

  it('a plain member cannot create groups or events', () => {
    const a = abilityFor(base({ communityRole: { communityId: C, role: 'member' } }));
    expect(a.can('read', 'Group')).toBe(true);
    expect(a.can('create', 'Group')).toBe(false);
    expect(a.can('create', 'Event')).toBe(false);
  });

  it('member toggles grant exactly invite/approve/post — never group/event creation', () => {
    const a = abilityFor(base({
      communityRole: { communityId: C, role: 'member' },
      communityPermissions: { invite_members: true, approve_join_requests: true, create_posts: true },
    }));
    expect(a.can('create', 'Member')).toBe(true);
    expect(a.can('update', 'JoinRequest')).toBe(true);
    expect(a.can('create', 'Post')).toBe(true);
    expect(a.can('create', 'Group')).toBe(false); // toggles never grant admin actions
    expect(a.can('create', 'Event')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fail.** Run: `pnpm --filter @padel/permissions test` → FAIL (no `./ability`).

- [ ] **Step 3: Implement `ability.ts`**

```ts
import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { Action, Subject } from './subjects';
import type { AuthContext } from './context';

export type AppAbility = MongoAbility<[Action, Subject]>;

export function abilityFor(ctx: AuthContext): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  // 1) Platform super-admin short-circuit.
  if (ctx.tenantRoles.some((t) => t.role === 'super_admin')) {
    can('manage', 'all');
    return build();
  }

  const cr = ctx.communityRole;
  if (cr) {
    const scope = { community_id: cr.communityId } as const;

    if (cr.role === 'owner') {
      can('manage', 'all', scope); // full control within the community
    } else if (cr.role === 'admin') {
      // Admin manages content + members but not billing or community deletion.
      for (const s of ['Group', 'Event', 'Post', 'Member', 'JoinRequest', 'Broadcast'] as Subject[]) {
        can('manage', s, scope);
      }
      can('read', 'Analytics', scope);
      can(['read', 'update'], 'Community', scope);
      cannot('delete', 'Community', scope);
      cannot('manage', 'Payment', scope);
    } else {
      // Plain member: read community content; manage own membership only.
      for (const s of ['Community', 'Group', 'Event', 'Post', 'Member'] as Subject[]) {
        can('read', s, scope);
      }
      // Member-permission toggles (never grant create Group/Event — those have no toggle).
      const p = ctx.communityPermissions;
      if (p?.invite_members) can('create', 'Member', scope);
      if (p?.approve_join_requests) can('update', 'JoinRequest', scope);
      if (p?.create_posts) can('create', 'Post', scope);
    }
  }

  return build();
}
```

- [ ] **Step 4: Replace `index.ts`**

```ts
export * from './subjects';
export * from './context';
export * from './ability';
```

- [ ] **Step 5: Run — verify pass + typecheck.**

Run: `pnpm --filter @padel/permissions test` → 5 passing.
Run: `pnpm --filter @padel/permissions typecheck` → clean.
Note: the no-scope test `can('create','Group')` checks the rule with no resource; CASL returns true if any matching rule exists regardless of conditions when the subject (not an object) is passed. The truth table above is written to pass with this behavior; resource-scoped checks (`can('create','Group', subjectObj)`) are exercised in `@padel/authz`.

- [ ] **Step 6: Commit Part C**

```bash
git add packages/permissions
git commit -m "feat(permissions): CASL abilityFor over tenant+community roles and member toggles"
```

---

# PART D — `@padel/authz` two-check helper

### Task 13: Scaffold `@padel/authz`

**Files:** Create `packages/authz/package.json`, `packages/authz/tsconfig.json`, `packages/authz/src/index.ts`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@padel/authz",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "lint": "eslint src", "test": "vitest run" },
  "dependencies": {
    "@padel/permissions": "workspace:*",
    "@padel/features": "workspace:*",
    "@padel/db": "workspace:*"
  },
  "devDependencies": { "vitest": "^2.1.0" }
}
```

- [ ] **Step 2: `tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: `src/index.ts`**

```ts
export * from './authorize';
```

- [ ] **Step 4: Install.** Run: `pnpm install` → workspace links resolve.

---

### Task 14: `authorize()` (TDD — entitlement + permission)

**Files:** Create `packages/authz/src/authorize.ts`, `packages/authz/src/authorize.test.ts`

- [ ] **Step 1: Write the failing test — `authorize.test.ts`** (stub the client's `rpc`)

```ts
import { describe, it, expect } from 'vitest';
import { authorize } from './authorize';
import type { AuthContext } from '@padel/permissions';
import type { TypedClient } from '@padel/db';

const ctx: AuthContext = {
  userId: 'u1', tenantRoles: [], communityRole: { communityId: 'c1', role: 'admin' },
};
// minimal stub: rpc resolves to { data } based on the feature flag we set
const stubClient = (featureOn: boolean) =>
  ({ rpc: async () => ({ data: featureOn, error: null }) }) as unknown as TypedClient;

describe('authorize', () => {
  it('passes when entitlement + permission both hold', async () => {
    const r = await authorize({
      client: stubClient(true), ctx, action: 'create', subject: 'Broadcast',
      feature: 'custom_broadcasts', featureScope: 'community', communityId: 'c1',
    });
    expect(r.ok).toBe(true);
  });

  it('fails with reason "entitlement" when the plan lacks an MVP feature', async () => {
    const r = await authorize({
      client: stubClient(false), ctx, action: 'create', subject: 'Broadcast',
      feature: 'custom_broadcasts', featureScope: 'community', communityId: 'c1',
    });
    expect(r).toEqual({ ok: false, reason: 'entitlement', detail: 'custom_broadcasts' });
  });

  it('fails with reason "forbidden" when CASL denies', async () => {
    const memberCtx: AuthContext = { ...ctx, communityRole: { communityId: 'c1', role: 'member' } };
    const r = await authorize({
      client: stubClient(true), ctx: memberCtx, action: 'delete', subject: 'Community',
      communityId: 'c1',
    });
    expect(r).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('skips the entitlement check for a non-MVP feature key', async () => {
    const r = await authorize({
      client: stubClient(false), ctx, action: 'read', subject: 'Analytics',
      feature: 'analytics_pro', featureScope: 'community', communityId: 'c1',
    });
    expect(r.ok).toBe(true); // analytics_pro is not MVP → entitlement gate skipped; admin can read Analytics
  });
});
```

- [ ] **Step 2: Run — verify fail.** Run: `pnpm --filter @padel/authz test` → FAIL (no `./authorize`).

- [ ] **Step 3: Implement `authorize.ts`**

```ts
import { abilityFor, type Action, type Subject, type AuthContext } from '@padel/permissions';
import {
  hasFeature, hasAccountFeature, isMvpFeature,
  type CommunityFeatureKey, type AccountFeatureKey,
} from '@padel/features';
import type { TypedClient } from '@padel/db';

export interface AuthorizeInput {
  client: TypedClient;
  ctx: AuthContext;
  action: Action;
  subject: Subject;
  /** Optional resource object for scope-aware CASL checks (e.g. { community_id }). */
  resource?: Record<string, unknown>;
  /** Optional entitlement gate. Only enforced for MVP feature keys. */
  feature?: CommunityFeatureKey | AccountFeatureKey;
  featureScope?: 'community' | 'account';
  communityId?: string;
}

export type AuthorizeResult =
  | { ok: true }
  | { ok: false; reason: 'forbidden' | 'entitlement'; detail?: string };

export async function authorize(input: AuthorizeInput): Promise<AuthorizeResult> {
  // 1) Entitlement check (only MVP-scoped features are enforced now).
  if (input.feature && isMvpFeature(input.feature)) {
    const ok =
      input.featureScope === 'account'
        ? await hasAccountFeature(input.client, input.ctx.userId, input.feature as AccountFeatureKey)
        : await hasFeature(input.client, input.communityId ?? '', input.feature as CommunityFeatureKey);
    if (!ok) return { ok: false, reason: 'entitlement', detail: input.feature };
  }

  // 2) Permission check (CASL).
  const ability = abilityFor(input.ctx);
  const ok = input.resource
    ? ability.can(input.action, { __caslSubjectType__: input.subject, ...input.resource } as never)
    : ability.can(input.action, input.subject);
  if (!ok) return { ok: false, reason: 'forbidden' };

  return { ok: true };
}
```

- [ ] **Step 4: Run — verify pass + typecheck.**

Run: `pnpm --filter @padel/authz test` → 4 passing.
Run: `pnpm --filter @padel/authz typecheck` → clean.

- [ ] **Step 5: Commit Part D**

```bash
git add packages/authz
git commit -m "feat(authz): two-check authorize() composing entitlement + CASL"
```

---

# PART E — Wire defaults + DoD

### Task 15: Extend `create_community_with_personal_tenant` (default permissions row)

**Files:** Create `infra/supabase/migrations/0016_wire_defaults.sql`

- [ ] **Step 1: Write `0016_wire_defaults.sql`** (CREATE OR REPLACE; add the permissions row; Starter stays implicit via the resolver default — no `community_subscriptions` row)

```sql
create or replace function create_community_with_personal_tenant(
  p_name        text,
  p_type        text,
  p_country     text,
  p_privacy     text default 'public',
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user      uuid := auth.uid();
  v_tenant    uuid;
  v_community uuid;
  v_group     uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  insert into tenants (type, name, country, is_personal, owner_id)
    values ('community', p_name, p_country, true, v_user)
    returning id into v_tenant;

  insert into tenant_memberships (user_id, tenant_id, role)
    values (v_user, v_tenant, 'community_owner');

  insert into communities (tenant_id, name, description, type, privacy)
    values (v_tenant, p_name, p_description, p_type, p_privacy)
    returning id into v_community;

  -- Default member-permission toggles (all off). Starter tier is implicit (no subscription row;
  -- community_plan() defaults to 'starter').
  insert into community_permissions (community_id) values (v_community);

  insert into community_members (community_id, user_id, role)
    values (v_community, v_user, 'owner');

  insert into groups (community_id, name, is_general)
    values (v_community, p_name, true)
    returning id into v_group;

  insert into group_members (group_id, user_id) values (v_group, v_user);

  return v_community;
end;
$$;
```

- [ ] **Step 2: Apply + verify defaults are created**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Then:
```bash
docker exec -i supabase_db_padeljam psql -U postgres -d postgres <<'SQL'
begin;
insert into auth.users (id, instance_id, aud, role, email)
  values ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wire@example.com') on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
select create_community_with_personal_tenant('Wired','friends','PT') as cid \gset
set local role postgres;
select
  (select count(*) from community_permissions where community_id = :'cid') as perms_row,
  community_plan(:'cid') as plan;
rollback;
SQL
```
Expected: `perms_row = 1`, `plan = starter`.

---

### Task 16: Spec-03 DoD integration test (server denies a plan-gated action)

**Files:** Create `infra/supabase/tests/two_check.sql`

- [ ] **Step 1: Write `infra/supabase/tests/two_check.sql`** (a starter community is denied `custom_broadcasts` at the server even if UI "allowed" it)

```sql
-- A starter community resolves custom_broadcasts = false; an upgrade to basic flips it true.
begin;
insert into auth.users (id, instance_id, aud, role, email)
  values ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tc@example.com') on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select create_community_with_personal_tenant('TwoCheck','friends','PT') as cid \gset
set local role postgres;

do $$
declare cid uuid := (select id from communities where name='TwoCheck' order by created_at desc limit 1);
begin
  if community_has_feature(cid,'custom_broadcasts') then
    raise exception 'EXPECTED starter to lack custom_broadcasts';
  end if;
  raise notice 'OK starter denied custom_broadcasts';
  -- upgrade to basic
  insert into community_subscriptions (community_id, plan_id) values (cid, 'basic');
  if not community_has_feature(cid,'custom_broadcasts') then
    raise exception 'EXPECTED basic to grant custom_broadcasts';
  end if;
  raise notice 'OK basic grants custom_broadcasts';
  -- jammer_plus_included derivation: the owner now has account advanced_stats without a personal sub
  if not account_has_feature('55555555-5555-5555-5555-555555555555','advanced_stats') then
    raise exception 'EXPECTED owner of a basic community to derive jammer_plus advanced_stats';
  end if;
  raise notice 'OK jammer_plus_included derives advanced_stats for the owner';
end $$;
rollback;
```

- [ ] **Step 2: Run the DoD test**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < infra/supabase/tests/two_check.sql`
Expected: three `NOTICE: OK ...` lines, no `EXPECTED ...` exception.

---

### Task 17: Full verification + commit

**Files:** none new (verification + commit only). The seed↔registry sync is guarded by the row-count assertions in Tasks 2 and 4 plus the typed unions in `@padel/features` (a feature/limit key that exists in the registry but not the seed, or vice versa, surfaces as a failed count check or a resolver returning the default).

- [ ] **Step 1: Regenerate types (0016 changed the RPC body, not its signature — confirm no type drift)**

Run: `pnpm dlx supabase@latest --workdir infra gen types typescript --local > packages/db/src/database.types.ts`
Run: `git diff --stat packages/db/src/database.types.ts` (expect little/no change).

- [ ] **Step 2: Whole-monorepo green**

Run: `pnpm typecheck` → all workspaces pass (now includes `@padel/authz`).
Run: `pnpm test` → features/permissions/authz/auth/utils/config/i18n suites pass.
Run: `pnpm lint` → clean.

- [ ] **Step 3: Re-run both SQL integration tests against a fresh DB**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < infra/supabase/tests/caps.sql`
Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < infra/supabase/tests/two_check.sql`
Expected: all `OK` notices, no exceptions.

- [ ] **Step 4: Commit Part E**

```bash
git add infra/supabase/migrations/0016_wire_defaults.sql infra/supabase/tests/two_check.sql packages/db/src/database.types.ts
git commit -m "feat(authz): default community_permissions on creation + spec-03 DoD integration tests"
```

---

## Verification (end-to-end, maps to spec 03 Definition of Done)

1. **Roles produce correct allow/deny** — `pnpm --filter @padel/permissions test` (owner/admin/member/super_admin truth table + member toggles).
2. **Entitlements resolve from plan with defaults; three+ plans seeded** — `community_plan(seeded)=starter`; `plans` has 6 rows; `@padel/features` registry tests pass.
3. **`authorize()` enforces both checks, table-tested** — `pnpm --filter @padel/authz test` (entitlement-fail vs forbidden vs pass; non-MVP skip).
4. **A starter tenant is denied a higher-tier feature at the server even if UI showed it** — `two_check.sql` (`custom_broadcasts` false on starter, true after upgrade).
5. **RLS/triggers reflect entitlement + permission for a representative table** — `community_members` (members cap + co-organizer cap) and `groups` (groups cap) enforced by `caps.sql`; cross-tenant/permission RLS already in place from foundation.
6. **PostHog stays out** — no PostHog code added; entitlements are 100% DB-backed.

## Notes for the executor

- Run every `supabase` command with `--workdir infra` after `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token` (Docker must be running). Regenerate `database.types.ts` after any migration that adds/changes a function signature.
- The **highest-risk** piece is the cap triggers: they MUST be `SECURITY DEFINER` (so the COUNT sees all rows, not the caller's RLS-visible subset) and advisory-locked per community (so concurrent inserts can't both pass the boundary). The `caps.sql` test is the guard — do not weaken it.
- `account_plan` derives `jammer_plus` from owning a `jammer_plus_included` community; this is read-time only (no stored row), so it can't conflict with a real personal subscription and evaporates on downgrade.
- Billing webhooks (spec 09) will become the sole writer of `subscriptions`/`community_subscriptions`; for now they're seed/admin/service-role-written (no client policy). The `recurring_events` limit is seeded but inert until the events table exists (later plan) — wire its cap trigger then.
- `@padel/authz` is the only package that depends on both `@padel/permissions` and `@padel/features`; client UI can import just `@padel/permissions` for ability checks without pulling entitlement RPC code.
