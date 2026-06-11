# Communities Module (Mobile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full Communities module on mobile — reconcile/extend the schema, add RLS + RPCs + Storage, establish the `@padel/api` data-hooks package (TanStack Query), and build the Expo UI for create / join / view / manage / posts / reviews.

**Architecture:** Additively extend the existing hybrid `communities`/`groups`/`community_permissions` tables and add the social tables (join requests, invitations, reviews, posts, likes, comments, default community). Business logic that needs atomicity or invariant enforcement lives in `SECURITY DEFINER` RPCs (create/join/invite/accept/leave/archive/transfer); simple role/content writes are RLS-gated direct writes. The two-check rule is enforced server-side (RLS + `can_create_post`) and mirrored client-side via `@padel/permissions` (CASL) for UI gating. `@padel/api` exposes typed TanStack Query hooks over the `TypedClient` from `useSession()`; the mobile app is a thin UI over those hooks. Caps from spec-03 (members/groups/co-organizers) are enforced by existing triggers and the join/create flows deliberately interoperate with them.

**Tech Stack:** Supabase (Postgres, RLS, plpgsql RPCs, Storage, Realtime), `@tanstack/react-query`, Zod, `@casl/ability`, Expo SDK 56 + Expo Router, `expo-image-picker`, `@shopify/flash-list`, Vitest, local Supabase via `pnpm dlx supabase@latest --workdir infra`.

---

## Context

This is the **Communities module**, the first feature plan after the foundation (specs 00–02) and authorization core (spec 03). Source of truth for behavior: `Requirements/PadelJam_Communities_Requirements.docx` (CM-01…CM-44). It is built **full-vertical, mobile-only**, reconciled to our **hybrid tenant-above-community** model.

**Decisions (made with the user):**
1. Communities module only, full vertical (schema + RLS + RPCs + `@padel/api` hooks + mobile UI). Groups is a separate later plan; Events and billing webhooks are out of scope.
2. UI targets **`apps/mobile` (Expo)** only.
3. **Reconcile additively**: extend existing hybrid tables, keep `tenant_id`, keep our `community_permissions` column names (CASL depends on them), keep **Starter implicit** (no `community_subscriptions` row on create). Override the doc where it conflicts.

**Doc-conflict resolutions (flagged, deliberate):**
- `type` enum stays `'friends'` (not the doc's `'group_of_friends'`); the "Group of Friends" label is i18n-mapped from the `'friends'` token.
- `community_permissions` keeps our column names (`invite_members`/`approve_join_requests`/`create_posts`); we flip `create_posts` **default to true** (doc intent: posting on by default) and the create RPC sets it explicitly.
- **Starter implicit** — the create RPC does NOT insert a `community_subscriptions` row (overrides doc 3.2 DB-impact); `community_plan()` already defaults to `starter`.
- Archive state uses the existing **`archived_at`** timestamp on `communities` and `groups` (no `is_archived` boolean; client derives `isArchived = archived_at != null`). The spec-03 `enforce_group_cap` already keys off `archived_at is null`.
- `community_posts.result_event_id` is a **nullable column with NO FK** now (events table absent); the FK is added in the Events plan. The `kind='result'` render path exists.
- **Reviews ≥3-events eligibility is deferred** (events absent) — the unique + member RLS are present; the eligibility gate lands with Events.
- **Suggested communities ranking is a stub** (recency + simple `location ilike`); real proximity/friend ranking is deferred behind a stable hook signature.
- "Create Event" on the Created screen and the **Events/Groups community tabs are partial** (link-out / read-only list); Groups detail is the Groups plan.
- Owned-community cap (MVP = 1) = "user has a non-archived `community_members` row with `role='owner'`"; hard-coded 1 now (Club-tier multi-community later).

**What exists (do not rebuild):** monorepo `@padel/{config,db,auth,i18n,utils,features,permissions,authz}`; `@padel/api` is a **placeholder** (this plan builds it). Migrations 0001–0017. `communities(id,tenant_id,name,description,type[club|team|friends],privacy[public|request_to_join|private],archived_at,created_at)`, `community_members(community_id,user_id,role[owner|admin|member],created_at)`, `community_permissions(community_id,invite_members,approve_join_requests,create_posts,updated_at)`, `groups(id,community_id,name,is_general,is_private,archived_at,created_at)`, `group_members`. Helpers `auth_tenant_ids()`, `is_community_admin(c)`. Cap triggers `enforce_member_caps` (community_members), `enforce_group_cap` (groups). RPC `create_community_with_personal_tenant(p_name,p_type,p_country,p_privacy,p_description)`. CASL `abilityFor(ctx)` reads `communityRole` + `communityPermissions.{invite_members,approve_join_requests,create_posts}`. Mobile root `_layout.tsx`: `I18nextProvider > SessionProvider > Boot`; i18n via `apps/mobile/lib/i18n-mobile.ts` `registerMobileCopy` (namespaces auth/common/onboarding). `lib/supabase.ts` = secure-store `createAuthClient`.

**Conventions:** sequential additive SQL migrations `infra/supabase/migrations/NNNN_name.sql` (next is `0018`); SECURITY DEFINER fns `set search_path = public`, user errors `raise ... using errcode='P0001'`; run Supabase with `--workdir infra` after `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token`; regenerate `packages/db/src/database.types.ts` after schema changes; SQL tests under `infra/supabase/tests/*.sql` using `set local role authenticated` + `set local request.jwt.claims` + the `PT001` sentinel; packages export raw TS from `src/index.ts`, strict TS (`import type`, `noUncheckedIndexedAccess`); all user-facing copy via `useT` (new `community` namespace).

---

## File Structure

```
infra/supabase/migrations/
  0018_communities_extend.sql        +created_by/location/thumbnail/cover/cancellation/updated_at + CHECK
  0019_groups_extend.sql             +created_by/description/thumbnail_path
  0020_community_permissions_default.sql   create_posts default true + backfill
  0021_community_social_tables.sql   join_requests, invitations, reviews, posts, likes, comments, default
  0022_updated_at_triggers.sql       set_updated_at() + triggers
  0023_create_community_extend.sql   CREATE OR REPLACE create RPC + can_create_community()
  0024_community_social_rls.sql      RLS for new tables + widened communities read + is_community_member()
  0025_community_realtime.sql        realtime publication adds
  0026_storage_buckets.sql           3 buckets + storage.objects policies
  0028_community_rpcs.sql            join_community, request, invite, accept, leave, archive, transfer, remove_member, can_create_post
infra/supabase/tests/
  community_create.sql  community_join.sql  community_manage.sql  community_posts_rls.sql
  community_reviews_rls.sql  community_read.sql  community_storage_rls.sql
packages/permissions/src/   subjects.ts (+Review/Comment/Like/Invitation), ability.ts (+rules), ability.test.ts
packages/api/                package.json, tsconfig.json
  src/index.ts  client.ts  query-keys.ts  schemas.ts  auth-context.ts
  src/communities/{queries.ts,mutations.ts,realtime.ts}
  src/{schemas.test.ts, auth-context.test.ts, errors.test.ts}
apps/mobile/
  lib/i18n-mobile.ts (extend: community namespace), lib/storage.ts (upload helper)
  app/_layout.tsx (mount QueryClientProvider)
  app/(tabs)/_layout.tsx (community tab), app/(tabs)/community/{_layout,index,create,created}.tsx
  app/community/[id]/{_layout,posts,events,groups,members,about,join,compose}.tsx
  app/community/[id]/post/[postId].tsx
  app/community/[id]/reviews/{index,write}.tsx
  app/community/[id]/manage/{_layout,index,settings,permissions,members,requests,invite}.tsx
  components/community/*  (Hero, Switcher, EmptyState, PrivacyCards, SegmentedType, ImagePickerRow,
                           RulesToggle, RulesModal, AckGate, PostCard, PostComposer, CommentList,
                           ReviewCard, StarRating, MemberRow, SuggestedCommunityCard)
```

---

# PART A — Schema reconciliation & RLS

> Apply each migration with `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`. After 0021/0023/0024/0028 regenerate types.

### Task 1: Extend `communities` and `groups`; flip permissions default

**Files:** Create `0018_communities_extend.sql`, `0019_groups_extend.sql`, `0020_community_permissions_default.sql`

- [ ] **Step 1: `0018_communities_extend.sql`**

```sql
alter table communities
  add column created_by                   uuid references profiles(id),
  add column location                     text,
  add column thumbnail_path               text,
  add column cover_image_path             text,
  add column cancellation_rules_enabled   boolean not null default false,
  add column cancellation_rules_text      text,
  add column updated_at                   timestamptz not null default now();
-- enabled ⇒ non-empty text. (Archive uses the existing archived_at; no is_archived column.)
alter table communities add constraint communities_cancellation_rules_ck
  check (cancellation_rules_enabled = false
         or coalesce(length(btrim(cancellation_rules_text)), 0) > 0);
```

- [ ] **Step 2: `0019_groups_extend.sql`**

```sql
alter table groups
  add column created_by     uuid references profiles(id),
  add column description     text,
  add column thumbnail_path  text;
-- group archive also uses the existing archived_at (no is_archived).
```

- [ ] **Step 3: `0020_community_permissions_default.sql`**

```sql
alter table community_permissions alter column create_posts set default true;
update community_permissions set create_posts = true where create_posts = false;
```

- [ ] **Step 4: Apply + verify**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -c "\d communities" -c "\d groups"`
Expected: new columns + the `communities_cancellation_rules_ck` constraint present; `create_posts` default `true`.

---

### Task 2: Social tables

**Files:** Create `0021_community_social_tables.sql`

- [ ] **Step 1: Write `0021_community_social_tables.sql`**

```sql
create table community_join_requests (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','declined')),
  rules_acknowledged boolean not null default false,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references auth.users(id),
  unique (community_id, user_id)
);
create index cjr_pending_idx on community_join_requests(community_id) where status = 'pending';

create table community_invitations (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  inviter_id   uuid not null references auth.users(id) on delete cascade,
  invitee_id   uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  group_ids    uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (community_id, invitee_id)
);
create index ci_invitee_pending_idx on community_invitations(invitee_id) where status = 'pending';

create table community_reviews (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  body         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (community_id, user_id)
);

create table community_posts (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references communities(id) on delete cascade,
  author_id       uuid not null references auth.users(id) on delete cascade,
  kind            text not null default 'user' check (kind in ('user','result')),
  body            text,
  image_path      text,
  result_event_id uuid,  -- FK to events added in the Events plan (events table absent now)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint community_posts_content_ck
    check (coalesce(length(btrim(body)), 0) > 0 or image_path is not null or result_event_id is not null)
);
create index community_posts_feed_idx on community_posts(community_id, created_at desc);

create table post_likes (
  post_id    uuid not null references community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references community_posts(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on post_comments(post_id, created_at);

create table user_default_community (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  community_id uuid not null references communities(id) on delete cascade,
  updated_at   timestamptz not null default now()
);

alter table community_join_requests enable row level security;
alter table community_invitations  enable row level security;
alter table community_reviews      enable row level security;
alter table community_posts        enable row level security;
alter table post_likes             enable row level security;
alter table post_comments          enable row level security;
alter table user_default_community enable row level security;
```

- [ ] **Step 2: Apply + verify all 7 tables exist with RLS enabled**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -tc "select relname, relrowsecurity from pg_class where relname in ('community_join_requests','community_invitations','community_reviews','community_posts','post_likes','post_comments','user_default_community') order by relname;"`
Expected: 7 rows, all `relrowsecurity = t`.

---

### Task 3: `updated_at` triggers

**Files:** Create `0022_updated_at_triggers.sql`

- [ ] **Step 1: Write `0022_updated_at_triggers.sql`**

```sql
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger trg_communities_updated_at before update on communities
  for each row execute function set_updated_at();
create trigger trg_community_permissions_updated_at before update on community_permissions
  for each row execute function set_updated_at();
create trigger trg_community_reviews_updated_at before update on community_reviews
  for each row execute function set_updated_at();
create trigger trg_community_posts_updated_at before update on community_posts
  for each row execute function set_updated_at();
```

- [ ] **Step 2: Apply + verify**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -c "\df set_updated_at"`
Expected: function listed; reset clean.

---

### Task 4: RLS for social tables + widened `communities` read + `is_community_member`

**Files:** Create `0024_community_social_rls.sql`

> **Highest-risk RLS interaction:** widening `communities` SELECT to all authenticated users (so the join modal shows general info for request/private communities) must NOT widen the feed/roster. The existing `community_members: read` policy keys off "community visible", so after widening it would leak the roster. This migration **re-scopes `community_members` read** to membership/admin/public-community, and gates posts/comments/likes/reviews by `is_community_member`.

- [ ] **Step 1: Write `0024_community_social_rls.sql`**

```sql
-- Membership helper (mirrors is_community_admin).
create or replace function is_community_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from community_members where community_id = c and user_id = auth.uid());
$$;

-- Widen communities READ: any authenticated user may read the community ROW (join modal needs
-- general info for all privacy levels). Sensitive child data is gated per-table below.
drop policy if exists "communities: read" on communities;
create policy "communities: read" on communities for select using (auth.uid() is not null);

-- Re-scope community_members READ so the widened communities read does NOT leak rosters:
-- visible only to members/admins of the community, or for public communities (member counts/discovery).
drop policy if exists "community_members: read" on community_members;
create policy "community_members: read" on community_members for select using (
  is_community_member(community_id)
  or is_community_admin(community_id)
  or exists (select 1 from communities c where c.id = community_id and c.privacy = 'public')
);

-- join requests
create policy "cjr: read"   on community_join_requests for select
  using (user_id = auth.uid() or is_community_admin(community_id));
create policy "cjr: create" on community_join_requests for insert
  with check (user_id = auth.uid());
create policy "cjr: manage" on community_join_requests for update
  using (is_community_admin(community_id)) with check (is_community_admin(community_id));

-- invitations (no decline state)
create policy "ci: read"   on community_invitations for select
  using (invitee_id = auth.uid() or is_community_admin(community_id));
create policy "ci: create" on community_invitations for insert
  with check (is_community_admin(community_id));
create policy "ci: respond" on community_invitations for update
  using (invitee_id = auth.uid()) with check (invitee_id = auth.uid());

-- reviews (member-only; one per user via unique; eligibility ≥3 events deferred)
create policy "reviews: read"  on community_reviews for select using (is_community_member(community_id));
create policy "reviews: write" on community_reviews for insert
  with check (user_id = auth.uid() and is_community_member(community_id));
create policy "reviews: edit"  on community_reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- posts: read for members; create gated by can_create_post (defined in 0028); update/delete author or admin
create policy "posts: read" on community_posts for select using (is_community_member(community_id));
create policy "posts: update" on community_posts for update
  using (author_id = auth.uid() or is_community_admin(community_id));
create policy "posts: delete" on community_posts for delete
  using (author_id = auth.uid() or is_community_admin(community_id));
-- NOTE: the INSERT policy is created in 0028 after can_create_post() exists.

-- likes / comments: visible with the post (member of post's community); write as self
create policy "likes: read" on post_likes for select using (
  exists (select 1 from community_posts p where p.id = post_id and is_community_member(p.community_id)));
create policy "likes: write" on post_likes for insert with check (
  user_id = auth.uid()
  and exists (select 1 from community_posts p where p.id = post_id and is_community_member(p.community_id)));
create policy "likes: unlike" on post_likes for delete using (user_id = auth.uid());

create policy "comments: read" on post_comments for select using (
  exists (select 1 from community_posts p where p.id = post_id and is_community_member(p.community_id)));
create policy "comments: write" on post_comments for insert with check (
  author_id = auth.uid()
  and exists (select 1 from community_posts p where p.id = post_id and is_community_member(p.community_id)));
create policy "comments: delete" on post_comments for delete using (
  author_id = auth.uid()
  or exists (select 1 from community_posts p where p.id = post_id and is_community_admin(p.community_id)));

-- default community: self only
create policy "udc: all" on user_default_community for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Apply + verify policy presence**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -tc "select count(*) from pg_policies where tablename in ('community_posts','post_likes','post_comments','community_reviews','community_join_requests','community_invitations','user_default_community','community_members','communities');"`
Expected: count ≥ 20 (full integration assertions land in Task 14).

---

### Task 5: Realtime + Storage buckets

**Files:** Create `0025_community_realtime.sql`, `0026_storage_buckets.sql`

- [ ] **Step 1: `0025_community_realtime.sql`**

```sql
alter publication supabase_realtime add table community_members;
alter publication supabase_realtime add table community_join_requests;
alter publication supabase_realtime add table community_posts;
alter publication supabase_realtime add table post_likes;
alter publication supabase_realtime add table post_comments;
```

- [ ] **Step 2: `0026_storage_buckets.sql`** (thumbnails/covers public-read; post images member-gated)

```sql
insert into storage.buckets (id, name, public) values
  ('community-thumbnails','community-thumbnails', true),
  ('community-covers','community-covers', true),
  ('community-post-images','community-post-images', false)
on conflict (id) do nothing;

-- Path convention: {communityId}/... ; the first folder segment is the community id.
create policy "thumb/cover write: admin" on storage.objects for insert to authenticated
  with check (bucket_id in ('community-thumbnails','community-covers')
              and is_community_admin(((storage.foldername(name))[1])::uuid));
create policy "thumb/cover update: admin" on storage.objects for update to authenticated
  using (bucket_id in ('community-thumbnails','community-covers')
         and is_community_admin(((storage.foldername(name))[1])::uuid));
create policy "thumb/cover delete: admin" on storage.objects for delete to authenticated
  using (bucket_id in ('community-thumbnails','community-covers')
         and is_community_admin(((storage.foldername(name))[1])::uuid));
-- (public buckets ⇒ SELECT is public via getPublicUrl)

create policy "post-img read: member" on storage.objects for select to authenticated
  using (bucket_id = 'community-post-images'
         and is_community_member(((storage.foldername(name))[1])::uuid));
create policy "post-img write: member" on storage.objects for insert to authenticated
  with check (bucket_id = 'community-post-images'
              and is_community_member(((storage.foldername(name))[1])::uuid));
```

- [ ] **Step 3: Apply + verify buckets**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -tc "select id, public from storage.buckets where id like 'community-%' order by id;"`
Expected: 3 buckets; thumbnails/covers `public=t`, post-images `public=f`.

- [ ] **Step 4: Commit Part A schema**

```bash
git add infra/supabase/migrations/0018_*.sql infra/supabase/migrations/0019_*.sql infra/supabase/migrations/0020_*.sql infra/supabase/migrations/0021_*.sql infra/supabase/migrations/0022_*.sql infra/supabase/migrations/0024_*.sql infra/supabase/migrations/0025_*.sql infra/supabase/migrations/0026_*.sql
git commit -m "feat(communities): extend schema, social tables, RLS, realtime, storage buckets"
```

---

# PART B — RPCs

### Task 6: Extend the create-community RPC + `can_create_community`

**Files:** Create `0023_create_community_extend.sql`

- [ ] **Step 1: Write `0023_create_community_extend.sql`**

```sql
-- Owns = a non-archived community where the user is 'owner'. MVP cap = 1 (Club tier lifts later).
create or replace function can_create_community() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not exists (
    select 1 from community_members cm
    join communities c on c.id = cm.community_id
    where cm.user_id = auth.uid() and cm.role = 'owner' and c.archived_at is null
  );
$$;

-- Extend the existing seam (additive, defaulted params keep positional callers/tests compiling).
create or replace function create_community_with_personal_tenant(
  p_name        text,
  p_type        text,
  p_country     text,
  p_privacy     text default 'public',
  p_description text default null,
  p_location    text default null,
  p_thumbnail_path   text default null,
  p_cover_image_path text default null,
  p_cancellation_rules_enabled boolean default false,
  p_cancellation_rules_text    text default null
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

  insert into tenants (type, name, country, is_personal, owner_id)
    values ('community', p_name, p_country, true, v_user) returning id into v_tenant;
  insert into tenant_memberships (user_id, tenant_id, role)
    values (v_user, v_tenant, 'community_owner');

  insert into communities (tenant_id, created_by, name, description, type, privacy, location,
                           thumbnail_path, cover_image_path,
                           cancellation_rules_enabled, cancellation_rules_text)
    values (v_tenant, v_user, p_name, p_description, p_type, p_privacy, p_location,
            p_thumbnail_path, p_cover_image_path,
            p_cancellation_rules_enabled, p_cancellation_rules_text)
    returning id into v_community;

  insert into community_permissions (community_id, create_posts) values (v_community, true);
  insert into community_members (community_id, user_id, role) values (v_community, v_user, 'owner');
  -- General group named "[name] group" (doc 3.2); Starter stays implicit (no community_subscriptions row).
  insert into groups (community_id, created_by, name, is_general)
    values (v_community, v_user, p_name || ' group', true) returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, v_user);

  return v_community;
end;
$$;
```

- [ ] **Step 2: Apply + regenerate types**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Run: `pnpm dlx supabase@latest --workdir infra gen types typescript --local > packages/db/src/database.types.ts`
Run: `grep -c "create_community_with_personal_tenant\|can_create_community" packages/db/src/database.types.ts`
Expected: both functions present.

- [ ] **Step 3: Update the existing general-group-name assertions** in `infra/supabase/tests/caps.sql` and `infra/supabase/tests/two_check.sql` if any asserts `name = 'Caps'`/`'TwoCheck'` for the general group — change to `name = '<X> group'`. (Search both files; the cap tests insert a 2nd group named 'Second Group'/'Replacement', so likely only the general group lookups by community need no name change. Verify by running both tests in Task 14.)

---

### Task 7: Join / invite / accept / management RPCs + post-insert RLS

**Files:** Create `0028_community_rpcs.sql`

- [ ] **Step 1: Write `0028_community_rpcs.sql`**

```sql
-- Shared: add a user to a community + its general group, idempotently.
create or replace function add_member_to_community(p_community uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_general uuid;
begin
  insert into community_members (community_id, user_id, role)
    values (p_community, p_user, 'member')
    on conflict (community_id, user_id) do nothing;
  select id into v_general from groups
    where community_id = p_community and is_general = true and archived_at is null limit 1;
  if v_general is not null then
    insert into group_members (group_id, user_id) values (v_general, p_user)
      on conflict (group_id, user_id) do nothing;
  end if;
end; $$;

-- Join entrypoint. Returns 'joined' | 'requested'. Raises on missing ack / invite / cap.
create or replace function join_community(p_community_id uuid, p_ack boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v_privacy text; v_rules boolean; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select privacy, cancellation_rules_enabled into v_privacy, v_rules
    from communities where id = p_community_id;
  if v_privacy is null then raise exception 'community_not_found' using errcode='P0001'; end if;
  if v_rules and not p_ack then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;

  if v_privacy = 'public' then
    perform add_member_to_community(p_community_id, v_user);  -- member cap trigger may raise P0001
    return 'joined';
  elsif v_privacy = 'request_to_join' then
    insert into community_join_requests (community_id, user_id, rules_acknowledged)
      values (p_community_id, v_user, p_ack)
      on conflict (community_id, user_id) do update set rules_acknowledged = excluded.rules_acknowledged;
    return 'requested';
  else -- private
    if not exists (select 1 from community_invitations
                   where community_id = p_community_id and invitee_id = v_user and status = 'pending') then
      raise exception 'invite_required' using errcode='P0001';
    end if;
    perform add_member_to_community(p_community_id, v_user);
    update community_invitations set status='accepted', accepted_at=now()
      where community_id = p_community_id and invitee_id = v_user and status='pending';
    return 'joined';
  end if;
end; $$;

create or replace function accept_join_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_uid uuid; v_user uuid := auth.uid();
begin
  select community_id, user_id into v_cid, v_uid from community_join_requests where id = p_request_id;
  if v_cid is null then raise exception 'request_not_found' using errcode='P0001'; end if;
  if not (is_community_admin(v_cid)
          or (is_community_member(v_cid)
              and coalesce((select approve_join_requests from community_permissions where community_id=v_cid),false)))
  then raise exception 'forbidden' using errcode='P0001'; end if;
  update community_join_requests set status='accepted', responded_at=now(), responded_by=v_user
    where id = p_request_id;
  perform add_member_to_community(v_cid, v_uid);
end; $$;

create or replace function decline_join_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_user uuid := auth.uid();
begin
  select community_id into v_cid from community_join_requests where id = p_request_id;
  if v_cid is null then raise exception 'request_not_found' using errcode='P0001'; end if;
  if not (is_community_admin(v_cid)
          or (is_community_member(v_cid)
              and coalesce((select approve_join_requests from community_permissions where community_id=v_cid),false)))
  then raise exception 'forbidden' using errcode='P0001'; end if;
  update community_join_requests set status='declined', responded_at=now(), responded_by=v_user
    where id = p_request_id;
end; $$;

create or replace function invite_to_community(p_community_id uuid, p_invitee_ids uuid[], p_group_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not (is_community_admin(p_community_id)
          or (is_community_member(p_community_id)
              and coalesce((select invite_members from community_permissions where community_id=p_community_id),false)))
  then raise exception 'forbidden' using errcode='P0001'; end if;
  foreach v_uid in array p_invitee_ids loop
    insert into community_invitations (community_id, inviter_id, invitee_id, group_ids)
      values (p_community_id, auth.uid(), v_uid, coalesce(p_group_ids,'{}'))
      on conflict (community_id, invitee_id) do nothing;
  end loop;
end; $$;

create or replace function accept_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_user uuid := auth.uid(); v_groups uuid[]; v_g uuid;
begin
  select community_id, group_ids into v_cid, v_groups
    from community_invitations where id = p_invitation_id and invitee_id = v_user and status='pending';
  if v_cid is null then raise exception 'invitation_not_found' using errcode='P0001'; end if;
  perform add_member_to_community(v_cid, v_user);
  foreach v_g in array coalesce(v_groups,'{}') loop
    insert into group_members (group_id, user_id) values (v_g, v_user) on conflict do nothing;
  end loop;
  update community_invitations set status='accepted', accepted_at=now() where id = p_invitation_id;
end; $$;

create or replace function remove_member(p_community_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_community_admin(p_community_id) then raise exception 'forbidden' using errcode='P0001'; end if;
  delete from group_members gm using groups g
    where gm.group_id = g.id and g.community_id = p_community_id and gm.user_id = p_user_id;
  delete from community_members where community_id = p_community_id and user_id = p_user_id;
end; $$;

create or replace function leave_community(p_community_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_role text;
begin
  select role into v_role from community_members where community_id=p_community_id and user_id=v_user;
  if v_role is null then raise exception 'not_a_member' using errcode='P0001'; end if;
  if v_role = 'owner' then raise exception 'transfer_ownership_first' using errcode='P0001'; end if;
  delete from group_members gm using groups g
    where gm.group_id = g.id and g.community_id = p_community_id and gm.user_id = v_user;
  delete from community_members where community_id = p_community_id and user_id = v_user;
end; $$;

create or replace function archive_community(p_community_id uuid, p_archive boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_community_admin(p_community_id) then raise exception 'forbidden' using errcode='P0001'; end if;
  if p_archive then
    update communities set archived_at = now() where id = p_community_id;
    update groups set archived_at = now() where community_id = p_community_id and archived_at is null;
  else
    update communities set archived_at = null where id = p_community_id;
    update groups set archived_at = null where community_id = p_community_id;
  end if;
  select count(*) into v_count from groups where community_id = p_community_id;
  return v_count;
end; $$;

create or replace function transfer_ownership(p_community_id uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if not exists (select 1 from community_members where community_id=p_community_id and user_id=v_user and role='owner')
  then raise exception 'forbidden' using errcode='P0001'; end if;
  if not exists (select 1 from community_members where community_id=p_community_id and user_id=p_new_owner)
  then raise exception 'new_owner_not_member' using errcode='P0001'; end if;
  update community_members set role='admin'  where community_id=p_community_id and user_id=v_user;
  update community_members set role='owner'  where community_id=p_community_id and user_id=p_new_owner;
end; $$;

-- Server-side "create posts" gate (mirrors the two-check rule).
create or replace function can_create_post(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_community_admin(c)
      or (is_community_member(c)
          and coalesce((select create_posts from community_permissions where community_id=c), false));
$$;

create policy "posts: create" on community_posts for insert
  with check (author_id = auth.uid() and can_create_post(community_id));
```

- [ ] **Step 2: Apply + regenerate types + recursive typecheck**

Run: `pnpm dlx supabase@latest --workdir infra db reset`
Run: `pnpm dlx supabase@latest --workdir infra gen types typescript --local > packages/db/src/database.types.ts`
Run: `pnpm --filter @padel/db typecheck && pnpm --filter @padel/api typecheck`
Expected: clean (api still placeholder at this point; just confirms types compile).

- [ ] **Step 3: Commit Part B**

```bash
git add infra/supabase/migrations/0023_*.sql infra/supabase/migrations/0028_*.sql packages/db/src/database.types.ts infra/supabase/tests/caps.sql infra/supabase/tests/two_check.sql
git commit -m "feat(communities): create/join/invite/accept/manage RPCs + create-posts RLS gate"
```

---

# PART C — `@padel/permissions` additions & `@padel/api` package

### Task 8: Add CASL subjects + rules for social entities (TDD)

**Files:** Modify `packages/permissions/src/subjects.ts`, `ability.ts`, `ability.test.ts`

- [ ] **Step 1: Add to `SUBJECTS` in `subjects.ts`**: `'Review'`, `'Comment'`, `'Like'`, `'Invitation'` (append to the existing array, before `'all'`).

- [ ] **Step 2: Add failing tests to `ability.test.ts`**

```ts
it('member can create Post/Comment/Like and own Review; admin manages all social', () => {
  const m = abilityFor(base({ communityRole: { communityId: C, role: 'member' },
    communityPermissions: { invite_members: false, approve_join_requests: false, create_posts: true } }));
  expect(m.can('create', 'Comment')).toBe(true);
  expect(m.can('create', 'Like')).toBe(true);
  expect(m.can('create', 'Review')).toBe(true);
  const a = abilityFor(base({ communityRole: { communityId: C, role: 'admin' } }));
  expect(a.can('manage', 'Review')).toBe(true);
  expect(a.can('manage', 'Invitation')).toBe(true);
});
```

- [ ] **Step 3: Run → fail.** `pnpm --filter @padel/permissions test`

- [ ] **Step 4: Extend `ability.ts`** — in the `admin` branch add `'Review','Comment','Like','Invitation'` to the `manage` loop's subject list; in the `member` branch add:

```ts
for (const s of ['Review', 'Comment', 'Like'] as Subject[]) can('read', s, scope);
can('create', 'Comment', scope);
can('create', 'Like', scope);
can(['create', 'update'], 'Review', scope);
```
(The existing `create Post` toggle rule stays as-is. Members never `create Invitation` unless `invite_members` — already covered by the existing `create Member` toggle for the invite action; keep `Invitation` admin-only here.)

- [ ] **Step 5: Run → pass + typecheck.** `pnpm --filter @padel/permissions test && pnpm --filter @padel/permissions typecheck`

---

### Task 9: Scaffold `@padel/api` + mount TanStack Query (prove client injection)

**Files:** Create `packages/api/package.json`, `tsconfig.json`, `src/{index,client,query-keys}.ts`; modify `apps/mobile/app/_layout.tsx`, `apps/mobile/package.json`

- [ ] **Step 1: `packages/api/package.json`**

```json
{
  "name": "@padel/api",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "lint": "eslint src", "test": "vitest run" },
  "dependencies": {
    "@padel/db": "workspace:*",
    "@padel/auth": "workspace:*",
    "@padel/permissions": "workspace:*",
    "@padel/features": "workspace:*",
    "@padel/utils": "workspace:*",
    "@tanstack/react-query": "^5.62.0",
    "zod": "^3.24.0"
  },
  "peerDependencies": { "react": "*" },
  "devDependencies": { "vitest": "^2.1.0", "react": "^19.0.0", "@types/react": "^19.0.0" }
}
```

`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src"], "compilerOptions": { "jsx": "react-jsx" } }`

- [ ] **Step 2: `src/client.ts`** (client from session + PG error mapper)

```ts
import { useSession } from '@padel/auth';
import type { TypedClient } from '@padel/db';

export const useDb = (): TypedClient => useSession().client;

const KNOWN = [
  'owned_community_cap_reached', 'rules_acknowledgement_required', 'invite_required',
  'transfer_ownership_first', 'community_not_found', 'forbidden', 'not_a_member',
  'request_not_found', 'invitation_not_found', 'new_owner_not_member',
] as const;

/** Map a Supabase/Postgres error to a stable code the UI translates via i18n. */
export function mapPgError(error: { message?: string } | null): string | null {
  if (!error?.message) return null;
  const msg = error.message;
  for (const code of KNOWN) if (msg.includes(code)) return code;
  if (msg.includes('members_per_community limit reached')) return 'community_full';
  if (msg.includes('groups_per_community limit reached')) return 'groups_limit_reached';
  if (msg.includes('co_organizers limit reached')) return 'co_organizers_limit_reached';
  return 'unknown_error';
}
```

- [ ] **Step 3: `src/query-keys.ts`**

```ts
export const qk = {
  communities: ['communities'] as const,
  community: (id: string) => ['community', id] as const,
  members: (id: string) => ['community', id, 'members'] as const,
  permissions: (id: string) => ['community', id, 'permissions'] as const,
  posts: (id: string) => ['community', id, 'posts'] as const,
  post: (postId: string) => ['post', postId] as const,
  reviews: (id: string) => ['community', id, 'reviews'] as const,
  requests: (id: string) => ['community', id, 'requests'] as const,
  suggested: ['communities', 'suggested'] as const,
  canCreate: ['communities', 'can-create'] as const,
  defaultCommunity: ['communities', 'default'] as const,
};
```

- [ ] **Step 4: `src/index.ts`** — `export * from './client'; export * from './query-keys'; export * from './schemas'; export * from './auth-context'; export * from './communities/queries'; export * from './communities/mutations'; export * from './communities/realtime';`
  (Create empty stubs for `schemas.ts`/`auth-context.ts`/`communities/*` now exporting nothing, so the barrel compiles; they're filled in Tasks 10–13. Each stub: `export {};`)

- [ ] **Step 5: Mount QueryClientProvider** — in `apps/mobile/app/_layout.tsx`, add `@tanstack/react-query` `QueryClient` + `QueryClientProvider` wrapping the tree **inside** `SessionProvider` and outside `Boot` (so hooks see both the session client and the query cache). Create the `QueryClient` once at module scope.

- [ ] **Step 6: Add deps to `apps/mobile`** — `pnpm --filter mobile exec npx expo install @tanstack/react-query` (and add `@padel/api: workspace:*` to `apps/mobile/package.json` dependencies). Run `pnpm install`.

- [ ] **Step 7: Prove injection with the simplest hook** — add to `src/communities/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { useDb } from '../client';
import { qk } from '../query-keys';

export const useCanCreateCommunity = () => {
  const db = useDb();
  return useQuery({
    queryKey: qk.canCreate,
    queryFn: async () => {
      const { data, error } = await db.rpc('can_create_community');
      if (error) throw error;
      return data ?? false;
    },
  });
};
```

Run: `pnpm --filter @padel/api typecheck && pnpm --filter mobile typecheck`
Expected: clean. (Runtime use is exercised in Part D.)

---

### Task 10: Zod schemas (TDD)

**Files:** Create `packages/api/src/schemas.ts`, `packages/api/src/schemas.test.ts`

- [ ] **Step 1: Write failing tests — `schemas.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createCommunitySchema, reviewSchema, postSchema } from './schemas';

describe('schemas', () => {
  it('requires rules text when rules enabled', () => {
    expect(createCommunitySchema.safeParse({ name: 'A', type: 'club', privacy: 'public',
      rules: { enabled: true, text: '' } }).success).toBe(false);
    expect(createCommunitySchema.safeParse({ name: 'A', type: 'club', privacy: 'public',
      rules: { enabled: true, text: 'No-shows banned' } }).success).toBe(true);
  });
  it('rejects an empty community name', () => {
    expect(createCommunitySchema.safeParse({ name: '', type: 'club', privacy: 'public',
      rules: { enabled: false } }).success).toBe(false);
  });
  it('clamps review rating to 1..5', () => {
    expect(reviewSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 5 }).success).toBe(true);
  });
  it('requires a post to have body or image', () => {
    expect(postSchema.safeParse({ body: '', imagePath: undefined }).success).toBe(false);
    expect(postSchema.safeParse({ body: 'gg', imagePath: undefined }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fail.** `pnpm --filter @padel/api test`

- [ ] **Step 3: Implement `schemas.ts`**

```ts
import { z } from 'zod';

export const COMMUNITY_TYPES = ['club', 'team', 'friends'] as const;
export const PRIVACY = ['public', 'request_to_join', 'private'] as const;

export const createCommunitySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000).optional(),
    location: z.string().trim().max(120).optional(),
    type: z.enum(COMMUNITY_TYPES),
    privacy: z.enum(PRIVACY),
    thumbnailPath: z.string().optional(),
    coverImagePath: z.string().optional(),
    rules: z.object({ enabled: z.boolean(), text: z.string().trim().optional() }),
  })
  .refine((v) => !v.rules.enabled || (v.rules.text?.length ?? 0) > 0, {
    path: ['rules', 'text'],
    message: 'rules_text_required',
  });
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const postSchema = z
  .object({ body: z.string().trim().max(4000).optional(), imagePath: z.string().optional() })
  .refine((v) => (v.body?.length ?? 0) > 0 || !!v.imagePath, { message: 'post_empty' });
export type PostInput = z.infer<typeof postSchema>;

export const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) });
```

- [ ] **Step 4: Run → pass + typecheck.** `pnpm --filter @padel/api test && pnpm --filter @padel/api typecheck`

---

### Task 11: AuthContext resolver (TDD) + ability hook

**Files:** Create `packages/api/src/auth-context.ts`, `packages/api/src/auth-context.test.ts`

- [ ] **Step 1: Write the failing test** — verify `buildAuthContext` assembles the `AuthContext` shape from raw rows (pure function; the I/O wrapper hook isn't unit-tested):

```ts
import { describe, it, expect } from 'vitest';
import { buildAuthContext } from './auth-context';

it('assembles AuthContext from rows', () => {
  const ctx = buildAuthContext('u1',
    [{ tenant_id: 't1', role: 'community_owner' }],
    { community_id: 'c1', role: 'admin' },
    { invite_members: true, approve_join_requests: false, create_posts: true });
  expect(ctx.userId).toBe('u1');
  expect(ctx.communityRole).toEqual({ communityId: 'c1', role: 'admin' });
  expect(ctx.communityPermissions?.invite_members).toBe(true);
});
```

- [ ] **Step 2: Run → fail.** `pnpm --filter @padel/api test`

- [ ] **Step 3: Implement `auth-context.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { TypedClient } from '@padel/db';
import { abilityFor, type AuthContext, type TenantRole, type CommunityRole } from '@padel/permissions';
import { useDb } from './client';
import { useSession } from '@padel/auth';

export function buildAuthContext(
  userId: string,
  tenantRows: { tenant_id: string; role: TenantRole }[],
  communityRole: { community_id: string; role: CommunityRole } | null,
  perms: { invite_members: boolean; approve_join_requests: boolean; create_posts: boolean } | null,
): AuthContext {
  return {
    userId,
    tenantRoles: tenantRows.map((r) => ({ tenantId: r.tenant_id, role: r.role })),
    communityRole: communityRole ? { communityId: communityRole.community_id, role: communityRole.role } : undefined,
    communityPermissions: perms ?? undefined,
  };
}

/** Resolve the live AuthContext for a community and return a memoized CASL ability. */
export function useAbility(communityId: string | undefined) {
  const db: TypedClient = useDb();
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: ['ability', communityId, userId],
    enabled: !!userId,
    queryFn: async () => {
      const [tenants, role, perms] = await Promise.all([
        db.from('tenant_memberships').select('tenant_id, role').eq('user_id', userId!),
        communityId
          ? db.from('community_members').select('community_id, role').eq('community_id', communityId).eq('user_id', userId!).maybeSingle()
          : Promise.resolve({ data: null }),
        communityId
          ? db.from('community_permissions').select('invite_members, approve_join_requests, create_posts').eq('community_id', communityId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return abilityFor(buildAuthContext(userId!, (tenants.data ?? []) as never, (role as { data: never }).data, (perms as { data: never }).data));
    },
  });
}
```

- [ ] **Step 4: Run → pass + typecheck.** `pnpm --filter @padel/api test && pnpm --filter @padel/api typecheck`

---

### Task 12: Community queries

**Files:** Modify `packages/api/src/communities/queries.ts`

Implement, following the `useCanCreateCommunity` pattern (each `useQuery` reads `useDb()`, throws on `error`, returns typed rows). Implement: `useCommunities` (the user's communities: `community_members` join `communities` for `auth.uid()`, plus role; split Managing vs Participating client-side), `useCommunity(id)`, `useCommunityMembers(id)` (join `profiles`), `useCommunityPermissions(id)`, `useDefaultCommunity`, `useSuggestedCommunities` (public, non-archived, not-a-member, order `created_at desc`, optional `location ilike` — STUB; comment the real ranking as deferred), `useCommunityReviews(id)` (rows + average), `useCommunityRequests(id)`.

- [ ] **Step 1:** Implement `useCommunity` + `useCommunityMembers` + `useCommunityPermissions` (the trio every screen needs). Example `useCommunity`:

```ts
export const useCommunity = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.community(id),
    queryFn: async () => {
      const { data, error } = await db.from('communities').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });
};
```

- [ ] **Step 2:** Implement `useCommunities`, `useDefaultCommunity`, `useSuggestedCommunities`, `useCommunityReviews`, `useCommunityRequests`, `useCommunityPosts` (the posts query: select `community_posts` ordered by `created_at desc` with embedded `post_likes(count)`, `post_comments(count)`, and a `liked:post_likes!left(user_id)` filtered to the current user for `likedByMe`). Keep each query small and typed.

- [ ] **Step 3: Typecheck.** `pnpm --filter @padel/api typecheck` → clean. (Behavior verified via the mobile UI + the SQL RLS tests in Task 14.)

---

### Task 13: Community mutations + realtime

**Files:** Modify `packages/api/src/communities/mutations.ts`, `packages/api/src/communities/realtime.ts`

- [ ] **Step 1:** Implement RPC mutations (each `useMutation` calls `db.rpc(...)`, throws mapped error, invalidates keys). Pattern:

```ts
export const useJoinCommunity = (communityId: string) => {
  const db = useDb(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ack: boolean) => {
      const { data, error } = await db.rpc('join_community', { p_community_id: communityId, p_ack: ack });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as 'joined' | 'requested';
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.communities }); qc.invalidateQueries({ queryKey: qk.community(communityId) }); },
  });
};
```
Implement likewise: `useCreateCommunity` (`create_community_with_personal_tenant` with the full param set), `useAcceptJoinRequest`/`useDeclineJoinRequest`, `useInviteMembers`, `useAcceptInvitation`, `useLeaveCommunity`, `useArchiveCommunity`, `useTransferOwnership`, `useRemoveMember`.

- [ ] **Step 2:** Implement direct-write mutations: `useMakeAdmin`/`useRemoveAdmin` (update `community_members.role`), `useUpsertReview` (`upsert` on `community_reviews`), `useCreatePost` (insert `community_posts`), `useToggleLike` (insert/delete `post_likes` with optimistic `onMutate` cache flip + rollback), `useAddComment` (insert `post_comments`), `useSetDefaultCommunity` (upsert `user_default_community`), `useUpdateCommunity` (update settings), `useUpdatePermissions` (update `community_permissions`). All invalidate the relevant `qk`.

- [ ] **Step 3:** Implement `realtime.ts`: `useCommunityFeedRealtime(communityId)` subscribes to postgres_changes on `community_posts`/`post_likes`/`post_comments` (filter by community/post), invalidating `qk.posts(communityId)` / `qk.post(...)`; `useMembersRealtime(communityId)` invalidates `qk.members`/`qk.requests`. Clean up channels on unmount.

- [ ] **Step 4: Typecheck + commit Part C.**

Run: `pnpm --filter @padel/api typecheck && pnpm --filter @padel/permissions test && pnpm --filter @padel/api test`
```bash
git add packages/permissions packages/api apps/mobile/app/_layout.tsx apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(api): @padel/api community hooks (TanStack Query), schemas, auth-context; CASL social subjects"
```

---

# PART D — Mobile UI (Expo Router)

> All copy via `useT('community')` — extend `apps/mobile/lib/i18n-mobile.ts` `registerMobileCopy` to register a `community` namespace bundle (en/pt-PT/pt-BR) including the type labels (`typeClub`/`typeTeam`/`typeFriends`) and the `mapPgError` codes. Image-heavy lists use `@shopify/flash-list` (`npx expo install @shopify/flash-list`). Image upload via `expo-image-picker` (`npx expo install expo-image-picker`) through `apps/mobile/lib/storage.ts`.

### Task 14: SQL integration tests (run before UI — lock the backend contract)

**Files:** Create `infra/supabase/tests/community_create.sql`, `community_join.sql`, `community_manage.sql`, `community_posts_rls.sql`, `community_reviews_rls.sql`, `community_read.sql`

Each follows the existing `PT001`-sentinel pattern (`set local role authenticated` + `set local request.jwt.claims`). Write the assertions described, then run all via `docker exec ... psql -v ON_ERROR_STOP=1 -f -`. Cover:
- **create:** extended RPC creates community + permissions(create_posts=true) + general group named "X group" + owner; `community_plan(cid)='starter'` (implicit); `can_create_community()` is false after; a 2nd create raises `owned_community_cap_reached`.
- **join:** public instant join adds community + general group; rules-enabled community without ack raises `rules_acknowledgement_required`; request_to_join creates a pending request; private without invite raises `invite_required`; the 11th member of a starter community raises `community_full`.
- **manage:** `make_admin` on starter raises `co_organizers limit reached` (co-org cap 0); after upgrading to basic, one admin promotion succeeds; `archive_community` cascades `archived_at` to groups and returns the count; `transfer_ownership` swaps roles and frees `can_create_community` for the old owner; `leave_community` as owner raises `transfer_ownership_first`.
- **posts_rls:** a non-member of a request/private community cannot select `community_posts`; a member can; a member of a community with `create_posts=false` is blocked inserting a post; an admin can insert.
- **reviews_rls:** a member upserts one review (second upsert updates, not duplicates); a non-member is denied.
- **read:** a non-member CAN select the community row (widened read) but CANNOT select its `community_members` (private/request) or `community_posts`; for a public community the member roster IS visible.

- [ ] **Step 1–6:** Write each test file (assertions above), run each, fix any RLS/RPC gaps. All must print `OK` notices with no `PT001`/error.
- [ ] **Step 7: Commit the tests.** `git add infra/supabase/tests/community_*.sql && git commit -m "test(communities): RPC + RLS + cap integration tests"`

---

### Task 15: Create Community flow

**Files:** `apps/mobile/lib/storage.ts`; `apps/mobile/app/(tabs)/community/create.tsx`, `created.tsx`; components `SegmentedType`, `PrivacyCards`, `ImagePickerRow`, `RulesToggle`, `RulesModal`

- [ ] **Step 1:** `lib/storage.ts` — `pickAndValidateImage()` (launch picker, enforce ≤5MB + jpeg/png/webp) and `uploadCommunityImage(client, bucket, communityId, uri)` (fetch→arrayBuffer→`storage.from(bucket).upload('{communityId}/{uuid}.{ext}', bytes, {contentType})`, return the stored path). Pure validation split into a tested helper `validateImageAsset(asset): {ok} | {error}`.
- [ ] **Step 2:** `create.tsx` — form bound to `createCommunitySchema`, fields in doc order (Name, Description, Location, Type segmented [labels via i18n, values club/team/friends], ThumbnailPicker square, CoverImagePicker 16:9, Privacy 3 cards, RulesToggle+textarea). Submit → `useCreateCommunity` (uploads happen on the Created screen since the community id is needed for the storage path; on create, pass thumbnail/cover as the chosen library keys, or null, then normalize uploads after). On success route to `created.tsx`.
- [ ] **Step 3:** `created.tsx` — Share/Copy Link/QR (use `expo-sharing`/`expo-clipboard` already-or-install), a disabled "Create Event (coming soon)" button (Events deferred), and "Manage Community" → community page. Entry to Create is hidden when `useCanCreateCommunity()` is false.
- [ ] **Step 4: Verify headless** — `pnpm --filter mobile typecheck`; `cd apps/mobile && npx expo export --platform ios --output-dir /tmp/c-export` succeeds (resolves `@padel/api`, image-picker, flash-list). Clean up. (Interactive create flow is human-verified on a simulator.)

---

### Task 16: Community tab — switcher, default, empty state, suggested

**Files:** `apps/mobile/app/(tabs)/_layout.tsx` (add `community` tab), `app/(tabs)/community/{_layout,index}.tsx`; components `CommunitySwitcher`, `EmptyState`, `SuggestedCommunityCard`

- [ ] **Step 1:** Add the Community tab to `(tabs)/_layout.tsx` (replace the placeholder `two`). `community/_layout.tsx` = Stack.
- [ ] **Step 2:** `community/index.tsx` — `useCommunities()`; if empty → `EmptyState` (title "Community", no search; `SuggestedCommunities` horizontal FlashList from `useSuggestedCommunities`, each card opens `/community/[id]/join`; "Create your community" card → `/(tabs)/community/create`, hidden if `!canCreate`). Otherwise render `CommunitySwitcher` (Managing/Participating, Active/Archived toggle, default indicator, "+ New community" hidden when `!canCreate`) and route into the selected community's `/community/[id]/posts`. `useSetDefaultCommunity` shows the confirmation toast. **No search affordance anywhere.**
- [ ] **Step 3: Verify** — typecheck + export. Human-verifies the tab/switcher/empty rendering on simulator.

---

### Task 17: Community page + tabs (Posts/Events/Groups/Members/About) + Join modal

**Files:** `app/community/[id]/{_layout,posts,events,groups,members,about,join}.tsx`; components `CommunityHero`, `AckGate`, `MemberRow`, `PostCard`

- [ ] **Step 1:** `[id]/_layout.tsx` — top tab navigator with `CommunityHero` (cover+thumbnail via `getPublicUrl`, name, Type·Members·Privacy pills). Tabs: Posts, Events, Groups, Members, About.
- [ ] **Step 2:** `about.tsx` — pills, Location, Admins list (from members where role in owner/admin), Created date, privacy summary line, the "Cancellation and attendance rules" link (when enabled → `RulesModal`), and the average-rating block → `/community/[id]/reviews`.
- [ ] **Step 3:** `members.tsx` — roster (FlashList of `MemberRow`) + an "Invite member" entry (visible per `useAbility` create-Member). `groups.tsx` — read-only list of the community's groups (Groups detail is the Groups plan); `events.tsx` — placeholder list / "coming soon" (Events plan). Both clearly partial.
- [ ] **Step 4:** `join.tsx` (`presentation:'modal'`) — non-member view: public shows full info + Join; request_to_join/private show general info + Request/Join. When `cancellation_rules_enabled`, render `AckGate` (toggle + rules link) above the CTA, CTA disabled until acked. CTA → `useJoinCommunity(ack)`; map `'joined'`/`'requested'` to banner/state; surface `community_full`/`invite_required`/`rules_acknowledgement_required` via i18n.
- [ ] **Step 5: Verify** — typecheck + export.

---

### Task 18: Posts feed + detail + composer (Realtime)

**Files:** `app/community/[id]/posts.tsx`, `post/[postId].tsx`, `compose.tsx`; components `PostComposer`, `CommentList`

- [ ] **Step 1:** `posts.tsx` — FlashList from `useCommunityPosts` (PostCard shows body/image + like & comment counts + likedByMe; result posts render with a result layout). `useCommunityFeedRealtime(id)` active. A compose FAB visible when `useAbility` allows `create Post`.
- [ ] **Step 2:** `compose.tsx` (modal) — `PostComposer` bound to `postSchema` (text + 1 optional photo via `lib/storage.ts` to `community-post-images`); submit → `useCreatePost`.
- [ ] **Step 3:** `post/[postId].tsx` — post detail: full content, like button (`useToggleLike`, optimistic), `CommentList` + add-comment box (`useAddComment`, `commentSchema`). Realtime updates comments/likes live.
- [ ] **Step 4: Verify** — typecheck + export.

---

### Task 19: Manage Community

**Files:** `app/community/[id]/manage/{_layout,index,settings,permissions,members,requests,invite}.tsx`; components reused from Create + `StarRating` n/a here

- [ ] **Step 1:** `manage/index.tsx` — visible only when `useAbility` is admin/owner: entries Settings, Members permission, Manage Members, Member Requests (request_to_join only), Invite members, Archive/Unarchive, Transfer ownership, Leave.
- [ ] **Step 2:** `settings.tsx` — reuses the Create form components to edit name/description/location/type/thumbnail/cover/privacy/rules (toggle off preserves text); `useUpdateCommunity`. `permissions.tsx` — 3 toggles → `useUpdatePermissions`.
- [ ] **Step 3:** `members.tsx` — roster with Make admin / Remove admin (`useMakeAdmin`/`useRemoveAdmin`; surfaces `co_organizers_limit_reached` from the cap) / Remove (`useRemoveMember`, confirm). `requests.tsx` — pending list with Accept/Decline (`useAcceptJoinRequest`/`useDeclineJoinRequest`; gated by role or `approve_join_requests`).
- [ ] **Step 4:** `invite.tsx` — searchable people list; one-group community shows the "added to community and General Group" confirm; multi-group shows a group picker (≥1). `useInviteMembers`. Archive uses `useArchiveCommunity` (confirm modal shows the returned group count); sole-owner Leave routes to a transfer-ownership prompt (`useTransferOwnership`).
- [ ] **Step 5: Verify** — typecheck + export.

---

### Task 20: Reviews

**Files:** `app/community/[id]/reviews/{index,write}.tsx`; components `ReviewCard`, `StarRating`

- [ ] **Step 1:** `reviews/index.tsx` — average + count header, sort + rating filter, FlashList of `ReviewCard`, a "Write a review" entry. `write.tsx` (modal) — `StarRating` (1–5) + optional text bound to `reviewSchema`; `useUpsertReview` (one per member, editable). **Eligibility ≥3 events is deferred** (events absent) — allow any member to write for now; leave a `// TODO(events): gate on ≥3 participated events` comment.
- [ ] **Step 2:** Show the average on the About tab (already wired in Task 17).
- [ ] **Step 3: Verify** — typecheck + export.

---

### Task 21: Full verification + commit + final review

- [ ] **Step 1:** Extend `apps/mobile/lib/i18n-mobile.ts` with the complete `community` namespace (all screen copy + type labels + every `mapPgError` code) for en/pt-PT/pt-BR. Confirm no hard-coded user-facing strings remain (grep the new screens).
- [ ] **Step 2:** Whole-monorepo green:

Run: `pnpm typecheck` (expect all workspaces incl. `@padel/api`), `pnpm test` (config/utils/auth/i18n/features/permissions/authz/api), `pnpm lint`.
Run: `cd apps/mobile && npx expo export --platform ios --output-dir /tmp/c-final` → bundles; clean up.
- [ ] **Step 3:** Re-run all SQL integration tests against a fresh DB (`db reset` then each `infra/supabase/tests/community_*.sql`). All `OK`.
- [ ] **Step 4: Commit Part D.**

```bash
git add apps/mobile packages/api
git commit -m "feat(communities): mobile UI — create/tab/page/join/posts/manage/reviews + i18n"
```

- [ ] **Step 5:** Dispatch the final whole-implementation code reviewer (security focus: the widened communities read + member-roster scoping; Storage RLS; the join/create RPCs vs cap triggers; `can_create_post` gate). Fix Critical/Important findings, commit, push.

---

## Verification (maps to CM requirements)

1. **Create + cap + general group + implicit Starter** (CM-01/05/07/08): `community_create.sql` + the Create flow.
2. **Privacy join semantics + rules acknowledgement on all levels** (CM-14/15/33/34): `community_join.sql` + Join modal.
3. **Roles + admin management + requests** (CM-19/20/23/24): `community_manage.sql` + Manage screens.
4. **Posts feed: like/comment, permission-gated, result posts render** (CM-36/37/38/39): `community_posts_rls.sql` + Posts UI.
5. **Reviews: one per member, average on About** (CM-40/41): `community_reviews_rls.sql` + Reviews UI (eligibility deferred, flagged).
6. **Archive cascades; sole owner must transfer** (CM-25/27/28): RPC tests + Manage UI.
7. **No search affordance; empty state; switcher + default** (CM-10/11/12/13): the Community tab UI (human-verified).

## Notes for the executor

- Run Supabase with `--workdir infra` after `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token`; Docker up. Regenerate `database.types.ts` after 0021/0023/0024/0028.
- **Highest-risk:** (a) the widened `communities` read + re-scoped `community_members` read — `community_read.sql` is the guard, do not weaken it; (b) Storage RLS on `community-post-images` (private) vs public thumbnails/covers — `community_storage_rls` assertions; (c) the create RPC is a 5th `CREATE OR REPLACE` revision and the join flow deliberately hits the member cap — write the SQL tests first and keep the new RPC params defaulted so `caps.sql`/`two_check.sql` keep compiling.
- UI is a thin layer over tested hooks + RPCs; full click-through (create→join→post→manage) needs an iOS/Android simulator and is human-verified. Everything else (migrations, RPCs, RLS, schemas, permissions, error mapping, resolver) is headless-verifiable.
- Groups detail, Events tab, the "Create Event" button, real Suggested ranking, and reviews ≥3-events eligibility are intentionally deferred — each flagged inline so they aren't mistaken for gaps.
```
