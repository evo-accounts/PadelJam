# Phase 1A — Social Graph + Profile View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the follow/block/report social graph + block-aware profile read RPCs, the own/other profile screens with stats + follow/block/report actions, searchable following/followers lists, and wire the Explore PlayerCard tap to `/profile/[id]`.

**Architecture:** One migration (`0055`) adds `follows`/`blocks`/`reports` tables, makes the `profiles` read policy block-aware, and adds block-aware `SECURITY DEFINER` RPCs (`get_player_profile`, `list_following`, `list_followers`, `block_user`, `unblock_user`). A new `@padel/api` `profile` module wraps them with TanStack hooks. Mobile screens render the profile; follow/unfollow/report use direct RLS-guarded table ops.

**Tech Stack:** Supabase Postgres (`security definer` RPCs, RLS), `@tanstack/react-query`, Expo SDK 56 + Expo Router, `@shopify/flash-list`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-phase1a-profile-design.md`. **Branch:** `feat/phase1a-profile` (off `feat/discovery-explore`). **Migration: `0055`** (`0054` reserved by unmerged Phase 0B).

## Resolved facts
- `profiles` columns used: `id, full_name, avatar_url, dominant_hand, court_side, location_text`. Read policy is currently `using (auth.role() = 'authenticated')` (0003).
- Stats: `group_event_results(event_id, user_id, final_placement, ranking_points, group_season_id, …)` — rows exist only for completed events. `played_matches = count(*)`, `best_position = min(final_placement)`.
- `group_seasons(id, group_id, season_number, …)`, `unique(group_id, season_number)`.
- Mutation idiom: `useMutation` + `useQueryClient` + `useDb` + `mapPgError` from `../client`; `onSuccess` invalidates `qk` keys (see `packages/api/src/communities/mutations.ts`).
- `avatarUrl(path)` from `apps/mobile/lib/community-images.ts` → `string | null`.
- PlayerCard call sites: `apps/mobile/app/(tabs)/explore.tsx:42` and `apps/mobile/app/explore/[type].tsx:51`.
- DB types CLI crashes on this machine (AVX) → hand-edit `database.types.ts`.

## File Structure
```
infra/supabase/migrations/0055_social_graph.sql      tables + RLS + block-aware profiles policy + 5 RPCs
infra/supabase/tests/social_graph.sql                follow/block/report/lists/stats test
packages/db/src/database.types.ts                    (modify: + 3 tables + 5 RPC signatures)
packages/api/src/query-keys.ts                       (modify: + profile keys)
packages/api/src/profile/queries.ts                  useProfile / useFollowing / useFollowers
packages/api/src/profile/mutations.ts                useFollow/useUnfollow/useBlock/useUnblock/useReport
packages/api/src/profile/queries.test.ts             qk key-shape test
packages/api/src/index.ts                            (modify: export profile/*)
apps/mobile/lib/i18n-mobile.ts                       (modify: + profile namespace)
apps/mobile/components/explore/PlayerCard.tsx        (modify: + onPress)
apps/mobile/app/(tabs)/explore.tsx                   (modify: PlayerCard onPress)
apps/mobile/app/explore/[type].tsx                   (modify: PlayerCard onPress)
apps/mobile/components/profile/ProfileView.tsx       header + stats + follow/kebab
apps/mobile/components/profile/BlockReportModals.tsx block + report modals
apps/mobile/app/(tabs)/profile.tsx                   (modify: own profile)
apps/mobile/app/profile/_layout.tsx                  Stack
apps/mobile/app/profile/[id].tsx                     other-player profile
apps/mobile/app/profile/[id]/following.tsx           following list
apps/mobile/app/profile/[id]/followers.tsx           followers list
```

---

## Task 1: Migration `0055_social_graph.sql` + SQL test

**Files:** Create `infra/supabase/migrations/0055_social_graph.sql`; Test `infra/supabase/tests/social_graph.sql`.

- [ ] **Step 1: Write the migration.** Create `infra/supabase/migrations/0055_social_graph.sql`:
```sql
-- Social graph for the Profile module: follows, blocks, reports + block-aware visibility.
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);
create index follows_followee_idx on follows(followee_id);

create table blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on blocks(blocked_id);

create table reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references profiles(id) on delete cascade,
  reported_user_id uuid not null references profiles(id) on delete cascade,
  reason           text not null check (reason in ('harassment','inappropriate','spam','fake','other')),
  description      text,
  status           text not null default 'open' check (status in ('open','reviewed')),
  created_at       timestamptz not null default now(),
  constraint reports_no_self check (reporter_id <> reported_user_id)
);

alter table follows enable row level security;
alter table blocks  enable row level security;
alter table reports enable row level security;
grant select, insert, delete on follows to authenticated;
grant select, insert, delete on blocks  to authenticated;
grant select, insert on reports to authenticated;

create policy "follows: read"   on follows for select using (auth.role() = 'authenticated');
create policy "follows: insert" on follows for insert with check (follower_id = auth.uid());
create policy "follows: delete" on follows for delete using (follower_id = auth.uid());

create policy "blocks: all" on blocks for all
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "reports: read"   on reports for select using (reporter_id = auth.uid());
create policy "reports: insert" on reports for insert with check (reporter_id = auth.uid());

-- Make profile reads block-aware (hide blocked users in either direction).
drop policy "profiles: read" on profiles;
create policy "profiles: read" on profiles for select using (
  auth.role() = 'authenticated'
  and not exists (
    select 1 from blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
       or (b.blocker_id = profiles.id and b.blocked_id = auth.uid())
  )
);

-- Block-aware (SECURITY DEFINER bypasses RLS, so re-apply the block check explicitly).
create or replace function get_player_profile(p_target uuid)
returns table (
  id uuid, full_name text, avatar_url text, dominant_hand text, court_side text, location_text text,
  played_matches bigint, best_position int, followers_count bigint, following_count bigint,
  is_following boolean, is_followed_by boolean
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.full_name, p.avatar_url, p.dominant_hand, p.court_side, p.location_text,
    (select count(*) from group_event_results r where r.user_id = p.id),
    (select min(r.final_placement) from group_event_results r where r.user_id = p.id),
    (select count(*) from follows f where f.followee_id = p.id),
    (select count(*) from follows f where f.follower_id = p.id),
    exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    exists (select 1 from follows f where f.follower_id = p.id and f.followee_id = auth.uid())
  from profiles p
  where p.id = p_target
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_target)
         or (b.blocker_id = p_target and b.blocked_id = auth.uid())
    );
$$;

create or replace function list_following(p_user uuid, p_search text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url
  from follows f
  join profiles p on p.id = f.followee_id
  where f.follower_id = p_user
    and (p_search is null or p.full_name ilike '%' || p_search || '%')
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by p.full_name
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

create or replace function list_followers(p_user uuid, p_search text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url
  from follows f
  join profiles p on p.id = f.follower_id
  where f.followee_id = p_user
    and (p_search is null or p.full_name ilike '%' || p_search || '%')
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by p.full_name
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

create or replace function block_user(p_target uuid)
returns void
language sql volatile security definer set search_path = public as $$
  insert into blocks (blocker_id, blocked_id) values (auth.uid(), p_target)
    on conflict (blocker_id, blocked_id) do nothing;
  delete from follows
   where (follower_id = auth.uid() and followee_id = p_target)
      or (follower_id = p_target and followee_id = auth.uid());
$$;

create or replace function unblock_user(p_target uuid)
returns void
language sql volatile security definer set search_path = public as $$
  delete from blocks where blocker_id = auth.uid() and blocked_id = p_target;
$$;

grant execute on function get_player_profile(uuid) to authenticated;
grant execute on function list_following(uuid, text, int, int) to authenticated;
grant execute on function list_followers(uuid, text, int, int) to authenticated;
grant execute on function block_user(uuid) to authenticated;
grant execute on function unblock_user(uuid) to authenticated;
```

- [ ] **Step 2: Write the failing test.** Create `infra/supabase/tests/social_graph.sql`:
```sql
-- Social graph: follow/unfollow, block (removes edges both ways + hides profile both directions),
-- list exclusions, report, stats, and self-constraints.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sg1@x.com'),
  ('f1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sg2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f1000001-0000-0000-0000-000000000001','sg1@x.com','+351900700001','Alice Viewer'),
  ('f1000002-0000-0000-0000-000000000002','sg2@x.com','+351900700002','Bob Target') on conflict do nothing;

do $$
declare cid uuid; gid uuid; seasonid uuid; ev uuid;
  alice constant uuid := 'f1000001-0000-0000-0000-000000000001';
  bob   constant uuid := 'f1000002-0000-0000-0000-000000000002';
begin
  -- Seed a played match for Bob so stats are non-zero (community → group → season → event → result).
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', bob), true);
  cid := create_community_with_personal_tenant('SGc','club','PT','public');
  perform set_config('role','postgres',true);
  insert into community_subscriptions (community_id, plan_id) values (cid,'basic')
    on conflict (community_id) do update set plan_id='basic';
  insert into groups (community_id, name, is_private) values (cid,'SGg',false) returning id into gid;
  insert into group_seasons (group_id, season_number) values (gid, 1)
    on conflict (group_id, season_number) do update set season_number = group_seasons.season_number returning id into seasonid;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, status)
    values (gid, bob,'americano','classic','points',2, now() - interval '1 day',60,'organizing_only','SGev','completed') returning id into ev;
  insert into group_event_results (group_season_id, event_id, user_id, final_placement, ranking_points)
    values (seasonid, ev, bob, 1, 100);

  -- Act as Alice.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', alice), true);

  -- get_player_profile sees Bob's stats.
  if not exists (select 1 from get_player_profile(bob) where played_matches = 1 and best_position = 1) then
    raise exception using errcode='PT001', message='stats not computed'; end if;

  -- Follow Bob → is_following true, follower count 1.
  insert into follows (follower_id, followee_id) values (alice, bob);
  if not exists (select 1 from get_player_profile(bob) where is_following and followers_count = 1) then
    raise exception using errcode='PT001', message='follow not reflected'; end if;
  -- Alice's following list contains Bob.
  if not exists (select 1 from list_following(alice) where id = bob) then
    raise exception using errcode='PT001', message='following list missing target'; end if;
  -- Bob's followers list contains Alice.
  if not exists (select 1 from list_followers(bob) where id = alice) then
    raise exception using errcode='PT001', message='followers list missing follower'; end if;
  -- search filters.
  if exists (select 1 from list_following(alice, 'zzzz') where id = bob) then
    raise exception using errcode='PT001', message='search did not filter'; end if;

  -- Unfollow reverts.
  delete from follows where follower_id = alice and followee_id = bob;
  if exists (select 1 from get_player_profile(bob) where is_following) then
    raise exception using errcode='PT001', message='unfollow not reflected'; end if;

  -- Re-follow, then block: block removes the follow edge and hides the profile both ways.
  insert into follows (follower_id, followee_id) values (alice, bob);
  insert into follows (follower_id, followee_id) values (bob, alice);
  perform block_user(bob);
  if exists (select 1 from follows where (follower_id=alice and followee_id=bob) or (follower_id=bob and followee_id=alice)) then
    raise exception using errcode='PT001', message='block did not remove follow edges'; end if;
  if exists (select 1 from get_player_profile(bob)) then
    raise exception using errcode='PT001', message='blocked target still visible to blocker'; end if;

  -- From Bob's side, Alice is also hidden (block is mutual for visibility).
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', bob), true);
  if exists (select 1 from get_player_profile(alice)) then
    raise exception using errcode='PT001', message='blocker hidden-from check failed'; end if;
  if exists (select 1 from list_following(alice) where id = bob) then
    raise exception using errcode='PT001', message='blocked user leaked into list'; end if;

  -- Unblock restores visibility (back as Alice).
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', alice), true);
  perform unblock_user(bob);
  if not exists (select 1 from get_player_profile(bob)) then
    raise exception using errcode='PT001', message='unblock did not restore visibility'; end if;

  -- Report persists.
  insert into reports (reporter_id, reported_user_id, reason, description) values (alice, bob, 'spam', 'test');
  if not exists (select 1 from reports where reporter_id = alice and reported_user_id = bob and reason = 'spam') then
    raise exception using errcode='PT001', message='report not stored'; end if;

  raise notice 'OK social_graph';
end $$;
rollback;
```

- [ ] **Step 3: Verify FAIL first.** Create only the test, then:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/social_graph.sql
```
Expected: error (`relation "follows" does not exist` or `function get_player_profile … does not exist`).

- [ ] **Step 4: Create the migration, re-reset, verify PASS:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/social_graph.sql
```
Expected: `NOTICE:  OK social_graph`.

- [ ] **Step 5: Commit:**
```bash
git add infra/supabase/migrations/0055_social_graph.sql infra/supabase/tests/social_graph.sql
git commit -m "feat(profile): social graph tables + block-aware profile RPCs + SQL test"
```

---

## Task 2: Hand-add DB types

**Files:** Modify `packages/db/src/database.types.ts`.

- [ ] **Step 1: Add the three tables** to the `Tables` block (alongside other tables; order doesn't matter):
```ts
      follows: {
        Row: { follower_id: string; followee_id: string; created_at: string }
        Insert: { follower_id: string; followee_id: string; created_at?: string }
        Update: { follower_id?: string; followee_id?: string; created_at?: string }
        Relationships: []
      }
      blocks: {
        Row: { id: string; blocker_id: string; blocked_id: string; created_at: string }
        Insert: { id?: string; blocker_id: string; blocked_id: string; created_at?: string }
        Update: { id?: string; blocker_id?: string; blocked_id?: string; created_at?: string }
        Relationships: []
      }
      reports: {
        Row: { id: string; reporter_id: string; reported_user_id: string; reason: string; description: string | null; status: string; created_at: string }
        Insert: { id?: string; reporter_id: string; reported_user_id: string; reason: string; description?: string | null; status?: string; created_at?: string }
        Update: { id?: string; reporter_id?: string; reported_user_id?: string; reason?: string; description?: string | null; status?: string; created_at?: string }
        Relationships: []
      }
```

- [ ] **Step 2: Add the five RPCs** to the `Functions` block:
```ts
      get_player_profile: {
        Args: { p_target: string }
        Returns: {
          id: string; full_name: string; avatar_url: string | null
          dominant_hand: string | null; court_side: string | null; location_text: string | null
          played_matches: number; best_position: number | null
          followers_count: number; following_count: number
          is_following: boolean; is_followed_by: boolean
        }[]
      }
      list_following: {
        Args: { p_user: string; p_search?: string | null; p_limit?: number; p_offset?: number }
        Returns: { id: string; full_name: string; avatar_url: string | null }[]
      }
      list_followers: {
        Args: { p_user: string; p_search?: string | null; p_limit?: number; p_offset?: number }
        Returns: { id: string; full_name: string; avatar_url: string | null }[]
      }
      block_user: { Args: { p_target: string }; Returns: undefined }
      unblock_user: { Args: { p_target: string }; Returns: undefined }
```

- [ ] **Step 3: Verify + commit:**
```bash
pnpm --filter @padel/db typecheck && grep -c "get_player_profile\|follows:\|blocks:\|reports:" packages/db/src/database.types.ts
git add packages/db/src/database.types.ts
git commit -m "chore(db): add social graph table + RPC types (hand-added)"
```
Expected: clean typecheck; grep ≥ 4.

---

## Task 3: `@padel/api` profile module

**Files:** Modify `packages/api/src/query-keys.ts`; Create `packages/api/src/profile/queries.ts`, `packages/api/src/profile/mutations.ts`, `packages/api/src/profile/queries.test.ts`; Modify `packages/api/src/index.ts`.

- [ ] **Step 1: Add query keys.** In `packages/api/src/query-keys.ts` `qk` object:
```ts
  profile: (id: string) => ['profile', id] as const,
  following: (id: string) => ['profile', id, 'following'] as const,
  followers: (id: string) => ['profile', id, 'followers'] as const,
```

- [ ] **Step 2: Key-shape test.** Create `packages/api/src/profile/queries.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';

describe('profile query keys', () => {
  it('shapes', () => {
    expect(qk.profile('u1')).toEqual(['profile', 'u1']);
    expect(qk.following('u1')).toEqual(['profile', 'u1', 'following']);
    expect(qk.followers('u1')).toEqual(['profile', 'u1', 'followers']);
  });
});
```
Run `pnpm --filter @padel/api test -- queries.test.ts` after Step 1 → PASS.

- [ ] **Step 3: Queries.** Create `packages/api/src/profile/queries.ts`:
```ts
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

const PAGE_SIZE = 20;
const nextOffset = (lastPage: unknown[], allPages: unknown[][]) =>
  lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE;

export const useProfile = (targetId: string | undefined) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.profile(targetId ?? ''),
    enabled: !!uid && !!targetId,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_player_profile', { p_target: targetId! });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
};

const useFollowList = (
  rpc: 'list_following' | 'list_followers',
  userId: string | undefined,
  search: string,
) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  const key = rpc === 'list_following' ? qk.following(userId ?? '') : qk.followers(userId ?? '');
  return useInfiniteQuery({
    queryKey: [...key, search] as const,
    enabled: !!uid && !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc(rpc, {
        p_user: userId!,
        p_search: search.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: nextOffset,
  });
};

export const useFollowing = (userId: string | undefined, search = '') =>
  useFollowList('list_following', userId, search);
export const useFollowers = (userId: string | undefined, search = '') =>
  useFollowList('list_followers', userId, search);
```

- [ ] **Step 4: Mutations.** Create `packages/api/src/profile/mutations.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

export const useFollow = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.from('follows').insert({ follower_id: uid!, followee_id: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => qc.invalidateQueries({ queryKey: qk.profile(targetId) }),
  });
};

export const useUnfollow = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.from('follows').delete().match({ follower_id: uid!, followee_id: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => qc.invalidateQueries({ queryKey: qk.profile(targetId) }),
  });
};

export const useBlock = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.rpc('block_user', { p_target: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => qc.invalidateQueries({ queryKey: qk.profile(targetId) }),
  });
};

export const useUnblock = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.rpc('unblock_user', { p_target: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => qc.invalidateQueries({ queryKey: qk.profile(targetId) }),
  });
};

export const useReport = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (input: { targetId: string; reason: string; description?: string }) => {
      const { error } = await db.from('reports').insert({
        reporter_id: uid!,
        reported_user_id: input.targetId,
        reason: input.reason,
        description: input.description ?? null,
      });
      if (error) throw error;
    },
  });
};
```

- [ ] **Step 5: Export.** In `packages/api/src/index.ts` add:
```ts
export * from './profile/queries';
export * from './profile/mutations';
```

- [ ] **Step 6: Verify + commit:**
```bash
pnpm --filter @padel/api test && pnpm --filter @padel/api typecheck
git add packages/api/src/query-keys.ts packages/api/src/profile packages/api/src/index.ts
git commit -m "feat(api): profile module (useProfile, follow/block/report hooks)"
```
Expected: tests pass, typecheck clean.

---

## Task 4: Wire the PlayerCard tap

**Files:** Modify `apps/mobile/components/explore/PlayerCard.tsx`, `apps/mobile/app/(tabs)/explore.tsx`, `apps/mobile/app/explore/[type].tsx`.

- [ ] **Step 1: Add `onPress` to PlayerCard.** In `apps/mobile/components/explore/PlayerCard.tsx`: change the import to `import { Pressable, StyleSheet, Text, View } from 'react-native';`, update the signature to `export function PlayerCard({ player, onPress }: { player: Player; onPress?: () => void })`, replace the outer `<View style={styles.card} …>` with `<Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={player.full_name}>` (closing `</Pressable>`), and remove the now-stale no-op doc comment.

- [ ] **Step 2: Pass navigation in the rail.** In `apps/mobile/app/(tabs)/explore.tsx` line ~42, change `renderItem={(p) => <PlayerCard player={p} />}` to:
```tsx
          renderItem={(p) => <PlayerCard player={p} onPress={() => router.push(`/profile/${p.id}`)} />}
```
(`router` is already in scope.)

- [ ] **Step 3: Pass navigation in see-all.** In `apps/mobile/app/explore/[type].tsx` line ~51, change `if (kind === 'players') return <PlayerCard player={item as never} />;` to:
```tsx
    if (kind === 'players')
      return <PlayerCard player={item as never} onPress={() => router.push(`/profile/${item.id}`)} />;
```
(`router` is already in scope.)

- [ ] **Step 4: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add "apps/mobile/components/explore/PlayerCard.tsx" "apps/mobile/app/(tabs)/explore.tsx" "apps/mobile/app/explore/[type].tsx"
git commit -m "feat(mobile): PlayerCard tap navigates to profile"
```
Expected: clean. (Routes `/profile/[id]` created in Task 8; expo-router typed routes resolve once those files exist — if a typed-route error appears, complete Task 8 then re-run.)

---

## Task 5: Profile i18n namespace

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Add the copy object** after the `mobileDiscovery` block (English-only, like discovery):
```ts
const mobileProfile = {
  en: {
    tab: 'Profile',
    follow: 'Follow',
    following: 'Following',
    followersCount: 'Followers',
    followingCount: 'Following',
    playedMatches: 'Played matches',
    bestPosition: 'Best position',
    unavailable: "This profile isn't available.",
    kebabShare: 'Share',
    kebabBlock: 'Block',
    kebabReport: 'Report',
    blockConfirmTitle: 'Block this player?',
    blockConfirmBody: 'They will be hidden and unfollowed.',
    blockConfirm: 'Block',
    reportTitle: 'Report player',
    reportReason: 'Reason',
    reportDescription: 'Description (optional)',
    reportSubmit: 'Submit report',
    cancel: 'Cancel',
    searchPlaceholder: 'Search by name',
    emptyFollowing: 'Not following anyone yet',
    emptyFollowers: 'No followers yet',
  },
} as const;
```
Note: `profile` was already registered as a namespace in Phase 0A with a `tab`/`placeholder` stub object (`mobileProfile`?). **Check first**: if a `mobileProfile` const already exists from Phase 0A, MERGE these keys into it instead of redeclaring (keep `placeholder` if present), and ensure it's registered once. The registration line `instance.addResourceBundle('en', 'profile', mobileProfile.en, true, false);` must exist exactly once.

- [ ] **Step 2: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): profile i18n keys"
```

---

## Task 6: Profile view components

**Files:** Create `apps/mobile/components/profile/ProfileView.tsx`, `apps/mobile/components/profile/BlockReportModals.tsx`.

- [ ] **Step 1: BlockReportModals.** Create `apps/mobile/components/profile/BlockReportModals.tsx`:
```tsx
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const REASONS = ['harassment', 'inappropriate', 'spam', 'fake', 'other'] as const;

export function BlockModal({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useT('profile');
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('blockConfirmTitle')}</Text>
          <Text style={styles.body}>{t('blockConfirmBody')}</Text>
          <Pressable style={styles.danger} onPress={onConfirm} accessibilityRole="button">
            <Text style={styles.dangerText}>{t('blockConfirm')}</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onCancel} accessibilityRole="button">
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function ReportModal({
  visible, onCancel, onSubmit,
}: { visible: boolean; onCancel: () => void; onSubmit: (reason: string, description: string) => void }) {
  const { t } = useT('profile');
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [description, setDescription] = useState('');
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('reportTitle')}</Text>
          <Text style={styles.label}>{t('reportReason')}</Text>
          <View style={styles.reasons}>
            {REASONS.map((r) => (
              <Pressable key={r} onPress={() => setReason(r)} style={[styles.chip, reason === r && styles.chipActive]} accessibilityRole="button">
                <Text style={[styles.chipText, reason === r && styles.chipTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder={t('reportDescription')}
            multiline
          />
          <Pressable style={styles.danger} onPress={() => onSubmit(reason, description)} accessibilityRole="button">
            <Text style={styles.dangerText}>{t('reportSubmit')}</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onCancel} accessibilityRole="button">
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 10 },
  title: { fontSize: 18, fontWeight: '700', color: '#0B1F3A' },
  body: { fontSize: 14, color: '#6B7685' },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginTop: 4 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#E7ECF3' },
  chipActive: { backgroundColor: '#0B1F3A' },
  chipText: { fontSize: 13, color: '#0B1F3A' },
  chipTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, padding: 12, minHeight: 64, textAlignVertical: 'top' },
  danger: { backgroundColor: '#D7263D', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dangerText: { color: '#fff', fontWeight: '700' },
  cancel: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#6B7685', fontWeight: '600' },
});
```

- [ ] **Step 2: ProfileView.** Create `apps/mobile/components/profile/ProfileView.tsx`:
```tsx
import { useFollow, useUnfollow, useBlock, useReport, useProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { Image } from 'expo-image';
import { BlockModal, ReportModal } from './BlockReportModals';

export function ProfileView({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const { t } = useT('profile');
  const router = useRouter();
  const query = useProfile(userId);
  const follow = useFollow();
  const unfollow = useUnfollow();
  const block = useBlock();
  const report = useReport();
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (query.isLoading) return <ActivityIndicator color="#0B1F3A" style={{ marginTop: 48 }} />;
  const p = query.data;
  if (!p) return <Text style={styles.unavailable}>{t('unavailable')}</Text>;

  const avatar = avatarUrl(p.avatar_url);
  const initials = p.full_name.split(' ').map((s) => s.charAt(0)).slice(0, 2).join('').toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImg} /> : <Text style={styles.initials}>{initials}</Text>}
        </View>
        <Text style={styles.name}>{p.full_name}</Text>
        <View style={styles.counts}>
          <Pressable onPress={() => router.push(`/profile/${userId}/followers`)} accessibilityRole="button">
            <Text style={styles.countNum}>{p.followers_count}</Text>
            <Text style={styles.countLabel}>{t('followersCount')}</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/profile/${userId}/following`)} accessibilityRole="button">
            <Text style={styles.countNum}>{p.following_count}</Text>
            <Text style={styles.countLabel}>{t('followingCount')}</Text>
          </Pressable>
        </View>
        {!isSelf && (
          <View style={styles.actions}>
            <Pressable
              style={[styles.followBtn, p.is_following && styles.followingBtn]}
              onPress={() => (p.is_following ? unfollow.mutate(userId) : follow.mutate(userId))}
              accessibilityRole="button">
              <Text style={[styles.followText, p.is_following && styles.followingText]}>
                {p.is_following ? t('following') : t('follow')}
              </Text>
            </Pressable>
            <Pressable style={styles.kebab} onPress={() => setMenuOpen((v) => !v)} accessibilityRole="button" accessibilityLabel="More">
              <SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} tintColor="#0B1F3A" size={22} />
            </Pressable>
          </View>
        )}
        {menuOpen && !isSelf && (
          <View style={styles.menu}>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); void Share.share({ message: p.full_name }); }}>
              <Text style={styles.menuText}>{t('kebabShare')}</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); setBlockOpen(true); }}>
              <Text style={styles.menuText}>{t('kebabBlock')}</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); setReportOpen(true); }}>
              <Text style={styles.menuText}>{t('kebabReport')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statNum}>{p.played_matches}</Text><Text style={styles.statLabel}>{t('playedMatches')}</Text></View>
        <View style={styles.stat}><Text style={styles.statNum}>{p.best_position ?? '—'}</Text><Text style={styles.statLabel}>{t('bestPosition')}</Text></View>
      </View>

      <BlockModal visible={blockOpen} onCancel={() => setBlockOpen(false)} onConfirm={() => { setBlockOpen(false); block.mutate(userId, { onSuccess: () => router.back() }); }} />
      <ReportModal visible={reportOpen} onCancel={() => setReportOpen(false)} onSubmit={(reason, description) => { setReportOpen(false); report.mutate({ targetId: userId, reason, description }); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  unavailable: { textAlign: 'center', color: '#6B7685', marginTop: 48, paddingHorizontal: 24 },
  header: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 16, gap: 10 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E6F0FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 96, height: 96 },
  initials: { fontSize: 30, fontWeight: '700', color: '#0B7BFF' },
  name: { fontSize: 22, fontWeight: '700', color: '#0B1F3A' },
  counts: { flexDirection: 'row', gap: 32 },
  countNum: { fontSize: 18, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  countLabel: { fontSize: 12, color: '#6B7685', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  followBtn: { backgroundColor: '#0B7BFF', borderRadius: 20, paddingHorizontal: 28, paddingVertical: 10 },
  followingBtn: { backgroundColor: '#E7ECF3' },
  followText: { color: '#fff', fontWeight: '700' },
  followingText: { color: '#0B1F3A' },
  kebab: { padding: 8 },
  menu: { alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E7ECF3' },
  menuText: { fontSize: 15, color: '#0B1F3A' },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 24, marginTop: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '700', color: '#0B1F3A' },
  statLabel: { fontSize: 13, color: '#6B7685', marginTop: 4 },
});
```

- [ ] **Step 2 verify + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/components/profile
git commit -m "feat(mobile): ProfileView + block/report modals"
```
Expected: clean (the `/profile/[id]/...` routes resolve after Task 8; if typed-route errors appear, finish Task 8 then re-run).

---

## Task 7: Profile screens + routes

**Files:** Modify `apps/mobile/app/(tabs)/profile.tsx`; Create `apps/mobile/app/profile/_layout.tsx`, `apps/mobile/app/profile/[id].tsx`, `apps/mobile/app/profile/[id]/following.tsx`, `apps/mobile/app/profile/[id]/followers.tsx`.

- [ ] **Step 1: Own profile.** Overwrite `apps/mobile/app/(tabs)/profile.tsx`:
```tsx
import { useSession } from '@padel/auth';
import { ScrollView, Text } from 'react-native';

import { ProfileView } from '@/components/profile/ProfileView';

export default function ProfileTab() {
  const uid = useSession().session?.user.id;
  if (!uid) return <Text style={{ textAlign: 'center', marginTop: 48, color: '#6B7685' }}>—</Text>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F7F9FC' }}>
      <ProfileView userId={uid} isSelf />
    </ScrollView>
  );
}
```

- [ ] **Step 2: Stack layout.** Create `apps/mobile/app/profile/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';

export default function ProfileStackLayout() {
  return <Stack screenOptions={{ headerBackTitle: 'Back' }} />;
}
```

- [ ] **Step 3: Other-player profile.** Create `apps/mobile/app/profile/[id].tsx`:
```tsx
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { ProfileView } from '@/components/profile/ProfileView';

export default function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F7F9FC' }}>
      <Stack.Screen options={{ title: '' }} />
      <ProfileView userId={id ?? ''} isSelf={false} />
    </ScrollView>
  );
}
```

- [ ] **Step 4: Following list.** Create `apps/mobile/app/profile/[id]/following.tsx`:
```tsx
import { useFollowing } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function FollowingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT('profile');
  const router = useRouter();
  const [search, setSearch] = useState('');
  const query = useFollowing(id, search);
  const rows = (query.data?.pages.flat() ?? []) as ReadonlyArray<{ id: string; full_name: string }>;
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('followingCount') }} />
      <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder={t('searchPlaceholder')} />
      <FlashList
        data={rows}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={<Text style={styles.empty}>{t('emptyFollowing')}</Text>}
        onEndReachedThreshold={0.5}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/profile/${item.id}`)} accessibilityRole="button">
            <Text style={styles.rowName}>{item.full_name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  search: { margin: 16, marginBottom: 0, borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  row: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  empty: { textAlign: 'center', color: '#6B7685', paddingVertical: 24 },
});
```

- [ ] **Step 5: Followers list.** Create `apps/mobile/app/profile/[id]/followers.tsx` — identical to Step 4 but `import { useFollowers }`, `const query = useFollowers(id, search);`, `title={t('followersCount')}`, and `ListEmptyComponent` uses `t('emptyFollowers')`. (Repeat the full file with those four substitutions; component name `FollowersScreen`.)

- [ ] **Step 6: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add "apps/mobile/app/(tabs)/profile.tsx" apps/mobile/app/profile
git commit -m "feat(mobile): profile screens (own, other, following/followers lists)"
```
Expected: clean (this resolves the typed routes referenced in Tasks 4 & 6).

---

## Task 8: Full verification

**Files:** none.

- [ ] **Step 1: Fresh DB + SQL test:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/social_graph.sql
```
Expected: `NOTICE:  OK social_graph`.

- [ ] **Step 2: Unit tests + workspace typecheck:**
```bash
pnpm --filter @padel/api test && pnpm -w typecheck
```
Expected: PASS; 0 type errors.

- [ ] **Step 3: Manual smoke (iOS simulator, JS only — no native rebuild).**
Run the app (`supabase functions serve` running). Sign in. From the Explore tab tap a player → profile opens with stats; tap Follow → it flips to Following and the follower count updates; open Following/Followers lists (search works); kebab → Block hides the profile and pops back; kebab → Report submits; the Profile tab shows your own stats with no Follow button.

- [ ] **Step 4: Finish the branch.**
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow superpowers:finishing-a-development-branch; integration targets `feat/discovery-explore` (stacked).

---

## Self-Review notes (addressed)
- **Spec coverage:** tables + block-aware policy → Task 1; RPCs → Task 1; hand types → Task 2; api module → Task 3; PlayerCard tap (DS-18) → Task 4; i18n → Task 5; ProfileView + block/report (PR-04/07/08) → Task 6; own/other profile + follow lists (PR-01/02/05/06) → Task 7; verification → Task 8.
- **No placeholders:** complete SQL/TS/TSX in every step. Followers screen (Task 7 Step 5) gives the four exact substitutions off the full Following file rather than re-pasting.
- **Type consistency:** RPC names `get_player_profile`/`list_following`/`list_followers`/`block_user`/`unblock_user` and arg names match across Task 1 (SQL), Task 2 (types), Task 3 (hooks). `qk.profile/following/followers(id)` consistent between Task 3 Step 1 and the test/hook usages. `useProfile/useFollowing/useFollowers/useFollow/useUnfollow/useBlock/useUnblock/useReport` names consistent across Tasks 3 and 6.
- **Cross-task ordering:** Tasks 4 & 6 reference `/profile/[id]` routes created in Task 7; their typecheck notes say to finish Task 8/7 if typed-route errors surface. Execute in order 1→8; a final `pnpm -w typecheck` in Task 8 is the gate.
- **i18n collision:** Task 5 flags that Phase 0A added a `profile` namespace stub — merge, don't redeclare.
- **Resolved:** stats from `group_event_results` (completed-events only); block removes edges both ways + hides both directions (tested); migration `0055` (avoids 0B's `0054`).
