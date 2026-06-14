# Phase 1A — Social Graph + Profile View — Design

*Padel Jam • 2026-06-14 • Brainstormed design / spec*

## Goal

Build the social graph and the read-only profile surface: `follows` / `blocks` / `reports`
tables, block-aware visibility, a profile-stats read RPC, the own-profile and other-player
profile screens, follow/unfollow, searchable following/followers lists, block & report, and
wiring the Explore **PlayerCard tap** to a real profile route. This is profile.md "Prompt 1".

Closes the social-graph portion of `Requirements/profile.md` (PR-01..PR-08) and unblocks the
roadmap's downstream items: DS-18 (PlayerCard tap → entity), DS-19 (follow-graph as a ranking
signal), HN-20 (social notifications).

**Decomposition:** Phase 1 splits into **1A** (this), **1B** (profile edit + account settings),
**1C** (subscriptions/billing). 1A is built first.

Branch `feat/phase1a-profile` (stacked on `feat/discovery-explore`, which has Phase 0A).
**Next migration: `0055`** (`0054` is reserved by the unmerged Phase 0B branch — avoid collision).

## Scope decisions (made with the user)

1. **Build full 1A now** (graph + view + follow + lists + block + report + PlayerCard tap).
2. **No profiles-schema change.** The view renders existing columns (`full_name`, `avatar_url`,
   `dominant_hand`, `court_side`, `location_text`) + computed stats. New columns the doc wants
   (description, dob, gender, preferred_time) belong with **edit (1B)**.
3. **"Message" deferred** — it opens direct chat (Phase 4 / Stream). Kebab = Share / Block / Report.
4. **"User's groups on profile" (PR-03) deferred** — showing another player's groups risks leaking
   private-group membership. 1A shows stats + a **recent-results** preview; the groups section
   returns with proper visibility rules later.

## Architecture

```
Explore PlayerCard / following lists ── router.push('/profile/[id]')
mobile profile screens (own + other + follow lists)
        │  TanStack Query hooks
@padel/api  src/profile/{queries,mutations}.ts  ── db.rpc(...) / db.from(...)
        │
Postgres
  tables:   follows, blocks, reports          (RLS; profiles read policy made block-aware)
  RPCs (security definer, block-aware):
    get_player_profile(p_target)              profile + stats + counts + relationship flags
    list_following(p_user,p_search,p_limit,p_offset) / list_followers(...)
    block_user(p_target) / unblock_user(p_target)
  stats source: group_event_results(final_placement), reads existing tables
```

## Data model (migration `0055_social_graph.sql`)

```sql
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
```

**RLS** (all three tables `enable row level security`):
- `follows`: SELECT `auth.role() = 'authenticated'`; INSERT `with check (follower_id = auth.uid())`; DELETE `using (follower_id = auth.uid())`.
- `blocks`: ALL `using (blocker_id = auth.uid()) with check (blocker_id = auth.uid())` (a user sees/manages only their own blocks).
- `reports`: SELECT/INSERT `using/with check (reporter_id = auth.uid())`.

**Block-aware `profiles` read policy** — replace the existing `"profiles: read"` policy:
```sql
drop policy "profiles: read" on profiles;
create policy "profiles: read" on profiles for select using (
  auth.role() = 'authenticated'
  and not exists (
    select 1 from blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
       or (b.blocker_id = profiles.id and b.blocked_id = auth.uid())
  )
);
```
*(Note: `SECURITY DEFINER` RPCs bypass RLS, so the profile/list RPCs below re-apply the same
block check explicitly. Retrofitting block-exclusion into the existing `explore_players` RPC is
a small follow-up, noted, not in 1A.)*

## RPCs (migration `0055`, `language sql|plpgsql stable security definer set search_path = public`, granted to `authenticated`)

- **`get_player_profile(p_target uuid)`** `returns table(...)` — one row when visible, zero rows when
  a block exists either direction between `auth.uid()` and `p_target`. Columns: `id, full_name,
  avatar_url, dominant_hand, court_side, location_text, played_matches bigint, best_position int,
  followers_count bigint, following_count bigint, is_following boolean, is_followed_by boolean`.
  - `played_matches = count(*) from group_event_results where user_id = p_target`
  - `best_position  = min(final_placement) from group_event_results where user_id = p_target` (null if none)
  - `followers_count = count(*) from follows where followee_id = p_target`
  - `following_count = count(*) from follows where follower_id = p_target`
  - `is_following = exists(follows where follower_id = auth.uid() and followee_id = p_target)`
  - `is_followed_by = exists(follows where follower_id = p_target and followee_id = auth.uid())`
- **`list_following(p_user uuid, p_search text default null, p_limit int default 20, p_offset int default 0)`**
  → `setof` `(id, full_name, avatar_url)` of users `p_user` follows, optional `ilike` name search,
  excluding anyone blocked-with the caller (either direction), paged, ordered `full_name`.
- **`list_followers(p_user uuid, p_search text, p_limit int, p_offset int)`** — symmetric (users who follow `p_user`).
- **`block_user(p_target uuid)`** `returns void` `volatile` — `insert into blocks(blocker_id, blocked_id)
  values (auth.uid(), p_target) on conflict do nothing`, then delete follow edges **both ways**
  (`delete from follows where (follower_id=auth.uid() and followee_id=p_target) or (follower_id=p_target and followee_id=auth.uid())`).
- **`unblock_user(p_target uuid)`** `returns void` `volatile` — `delete from blocks where blocker_id = auth.uid() and blocked_id = p_target`.
- **Follow / unfollow / report** use direct RLS-guarded table ops (no RPC): insert/delete `follows`
  with `follower_id = auth.uid()`; insert `reports` with `reporter_id = auth.uid()`.

## `@padel/api` — new `profile` module

`packages/api/src/profile/queries.ts` + `mutations.ts`, exported from `src/index.ts`; keys in `qk`:
- `useProfile(targetId)` → `useQuery(qk.profile(targetId))`, `db.rpc('get_player_profile', { p_target })`, returns the single row or null.
- `useFollowing(userId, search)` / `useFollowers(userId, search)` → `useInfiniteQuery` on `p_offset` over the list RPCs.
- Mutations (each invalidates the relevant `qk.profile*` keys on success):
  - `useFollow()` → `db.from('follows').insert({ follower_id: uid, followee_id: target })`
  - `useUnfollow()` → `db.from('follows').delete().match({ follower_id: uid, followee_id: target })`
  - `useBlock()` → `db.rpc('block_user', { p_target })`; `useUnblock()` → `db.rpc('unblock_user', { p_target })`
  - `useReport()` → `db.from('reports').insert({ reporter_id: uid, reported_user_id: target, reason, description })`
- `qk`: `profile: (id) => ['profile', id]`, `following: (id) => ['profile', id, 'following']`, `followers: (id) => ['profile', id, 'followers']`.

## Mobile screens & components

- **`apps/mobile/app/(tabs)/profile.tsx`** (replace stub) — own profile: `useSession` uid → `ProfileView` with own id; no Follow/kebab (those are for other users); Edit deferred to 1B (no button yet).
- **`apps/mobile/app/profile/[id].tsx`** (new) + **`apps/mobile/app/profile/_layout.tsx`** (Stack) — other-player profile. If `useProfile` returns null → "This profile isn't available." Otherwise `ProfileView` with Follow button + kebab.
- **`apps/mobile/app/profile/[id]/following.tsx`** + **`followers.tsx`** (new) — searchable paged lists (FlashList + a search `TextInput`), each row taps to `/profile/[rowId]`.
- **Components** under `apps/mobile/components/profile/`:
  - `ProfileView` — composes header + stats + recent-results; takes the `useProfile` result + an `isSelf` flag.
  - `ProfileHeader` — avatar (`avatarUrl()` from `lib/community-images.ts`), name, follower/following counts (tap → lists), and for non-self: a Follow/Following toggle button + a kebab (Share via RN `Share`, Block, Report).
  - `ProfileStats` — Played matches, Best position (— when null).
  - `BlockModal` / `ReportModal` — confirm block; report = reason picker + description; call the mutations.
- **`apps/mobile/components/explore/PlayerCard.tsx`** — give it an `onPress` that routes to `/profile/[id]` (remove the no-op); update the Explore screen + see-all to pass navigation (mirrors how community/group cards navigate).
- i18n: new `profile` namespace keys (English-only, fallback like `discovery`) — header labels, follow/following, counts, kebab actions, block/report copy, empty/unavailable states.

## Testing strategy

- **SQL** (`infra/supabase/tests/social_graph.sql`, PT001 sentinel): follow then `is_following`
  true + counts; unfollow reverts; `block_user` removes follow edges both ways and
  `get_player_profile` returns zero rows in both directions while blocked; `unblock_user`
  restores; `list_following`/`list_followers` exclude blocked and honor search + paging;
  `get_player_profile` stats (`played_matches`/`best_position`) from seeded `group_event_results`;
  report insert persists; self-follow / self-block / self-report rejected by the constraints.
- **`@padel/api`**: `qk.profile/following/followers` key-shape test.
- **Type/typecheck**: hand-add the new RPC signatures to `database.types.ts` (CLI broken); `pnpm -w typecheck`.
- **Manual smoke** (JS only — no native rebuild): tap a player in Explore → profile opens with
  stats; Follow toggles + counts update; following/followers lists open and search; Block hides
  the profile and removes follow; Report submits; own Profile tab shows your stats.

## Explicitly deferred (NOT 1A)
- Profile **edit** + account settings, avatar upload, OTP re-verify, password change, notif toggles,
  app prefs, support, delete account (**1B**). Subscriptions/billing (**1C**).
- **Message**/direct-chat button (Phase 4 / Stream). The **groups-on-profile** section (visibility work).
- Block-filtering inside the existing `explore_players` RPC (small follow-up).
- Realtime on `follows` (counts refetch on focus; realtime is YAGNI here).

## Conventions followed
Sequential additive migration `0055_social_graph.sql`; RPCs `security definer set search_path =
public` + `grant execute … to authenticated`; SQL tests under `infra/supabase/tests/` with
role/JWT-claims + `PT001`; regenerate/hand-add `packages/db/src/database.types.ts`; `@padel/api`
thin TanStack hooks wrapping `db.rpc`/`db.from` with `qk` keys, exported from `src/index.ts`;
reuse `avatarUrl()` (`lib/community-images.ts`); copy via `useT('profile')`.

## Open items for the implementation plan
- Confirm `group_event_results` is populated only for completed events (so `played_matches` counts
  real played matches) — read `0043_events_ranking_bridge.sql` for how rows are written.
- Confirm the `reason` value list matches any reasons already used elsewhere; otherwise this set is authoritative.
- Confirm whether `get_player_profile` should also expose `locale`/other display fields the header needs (keep the column set minimal — add only what the header/stats render).
