# Discovery — Explore Tab (Mobile) — Design

*Padel Jam • 2026-06-13 • Brainstormed design / spec*

## Goal

Ship the **Explore** surface of the Discovery module on mobile (Expo): a passive,
no-query bottom-nav tab of four ranked suggestion rails — **Players you might know,
Events, Communities, Groups** — each with a **"See all"** full list, plus the floating
Create-Event button. Discovery is a **read layer** over existing entities (events,
groups, communities, profiles); it ranks and filters, it does not own the entities.

Source requirement: `Requirements/discovery.md` (DS-01..DS-03, DS-17..DS-20 for the
Explore portion). The doc's component/file map assumes Next.js web; this build is
**mobile-only (Expo)**, consistent with the communities/groups/events modules.

## Scope decisions (made with the user)

1. **Explore only — Search deferred.** This build delivers the Explore tab. The Search
   overlay, its three states, scopes/banners, the unified Filter sheet, the
   `recent_searches` table, and the search icons on Home/Profile/Events-list are all
   **deferred to a later Search plan**.
2. **"See all" → plain full-list screen.** Because Search is deferred, "See all" opens a
   simple ranked, paged full-list screen for that entity type (the same ranking model),
   not the Search overlay.
3. **Players rail included, tap is a no-op for now.** Players are suggested by shared
   community/group co-membership (there is no follow graph yet). Tapping a player does
   nothing (or a toast) until the Profile module + a player-profile screen exist.
4. **Distance deferred — no geo schema in this build.** Communities store only free-text
   location, groups/events have no coordinates, and nothing captures coordinates anywhere
   today (the onboarding location step discards its text; no `expo-location` installed;
   `profiles.location_point` is effectively always NULL). Real distance ranking is a
   focused follow-up once coordinate capture exists. Explore ranks by **recency +
   co-membership + same-country**, with the ranking isolated so a distance term drops in
   later.
5. **Server-side ranking RPCs (Approach A).** Candidate selection + ranking live in four
   `SECURITY DEFINER` SQL functions; `@padel/api` hooks are thin wrappers; the mobile tab
   is pure UI. Matches the spec's "ranking is a server-side scoring function, kept
   isolated so it can be tuned," keeps relational co-membership scoring in SQL, and
   follows the prior modules' heavy `SECURITY DEFINER` + SQL-test pattern.

## Architecture

```
mobile Explore tab (UI)
        │  TanStack Query hooks
        ▼
@padel/api  src/discovery/queries.ts   ── thin db.rpc('explore_…') wrappers
        │  db.rpc(...)
        ▼
Postgres  4 SECURITY DEFINER functions  (explore_communities / _groups / _events / _players)
        │  read
        ▼
existing tables: communities, groups, events, profiles, *_members, event_participants, tenants
```

No new tables. No geo columns. The only new SQL is the four ranking functions (one
migration) and their grants. Type regen after the migration.

## The four ranking RPCs

All are `language sql|plpgsql stable security definer set search_path = public`, signed
`(p_limit int default 10, p_offset int default 0)` so the **same function powers both the
rail (limit 10, offset 0) and "See all" (paged)**. Because `SECURITY DEFINER` bypasses
RLS, each function **re-applies visibility explicitly** and is covered by SQL tests.
`granted to authenticated` (and `service_role` per the existing grant pattern); direct
table DML stays revoked.

**Viewer country** = the `tenants.country` of the viewer's personal tenant (via
`tenant_memberships` → `tenants`). **Entity country** = the `tenants.country` of the
community's tenant (groups/events resolve through their community). Same-country is a
ranking boost, not a hard filter.

### `explore_communities(p_limit, p_offset)`
- **Candidates:** `communities` where `archived_at is null`, `privacy in
  ('public','request_to_join')`, and the viewer is **not** a member
  (`community_members`).
- **Rank:** same-country desc → `created_at` desc.
- **Returns:** community columns + `privacy` + member/group counts as available, so the
  UI renders the **"Request to join"** CTA for `privacy = 'request_to_join'` (DS-17).

### `explore_groups(p_limit, p_offset)`
- **Candidates:** `groups` where `is_private = false`, `archived_at is null`, parent
  community is visible (public or in the viewer's tenants) and not archived, and the
  viewer is **not** a member (`group_members`).
- **Rank:** viewer is a member of the parent community (boost) → same-country →
  `created_at` desc.
- **Returns:** group columns + parent community id/name.

### `explore_events(p_limit, p_offset)`
- **Candidates:** `events` where `deleted_at is null`, `status = 'scheduled'`, `starts_at
  >= now()`, `is_private = false`, `group_id is not null`, the parent group is visible to
  the viewer (public group in a visible community, or the viewer is a group member), and
  the viewer is **not** already organizer/participant (`event_participants`). (Standalone
  events are always private by the `events_standalone_private` constraint, so they never
  surface here.)
- **Rank:** soonest `starts_at` asc → same-country.
- **Returns:** event columns needed by the existing EventCard (name, type/spec, starts_at,
  location, group/community context).

### `explore_players(p_limit, p_offset)`
- **Candidates:** `profiles` that share ≥1 community (`community_members`) or group
  (`group_members`) with the viewer, excluding the viewer themselves.
- **Rank:** shared-community/group count desc → `created_at` desc.
- **Returns:** `id, full_name, avatar_url, dominant_hand, court_side` + shared-context
  count. (Tap is a no-op for now.)

### SQL tests (`infra/supabase/tests/explore_*.sql`)
Using the established `set local role authenticated` + `set local request.jwt.claims` +
`PT001` sentinel pattern, assert per function:
- private / archived / already-member (or already-participant) candidates are **excluded**;
- `request_to_join` communities **are** surfaced; `public` are surfaced;
- a private group / private (standalone) event is **never** surfaced to a non-member;
- self is excluded from players; a non-co-member profile is excluded;
- same-country ordering boost applies;
- `p_limit` / `p_offset` paging works.

## `@padel/api` — new `discovery` module

`packages/api/src/discovery/queries.ts`:
- **Rail hooks** (limit 10, offset 0): `useExploreCommunities`, `useExploreGroups`,
  `useExploreEvents`, `useExplorePlayers` — each a `useQuery` calling the matching
  `db.rpc('explore_…', { p_limit: 10, p_offset: 0 })`.
- **See-all hooks** (paged): `useExploreCommunitiesList`, `…GroupsList`, `…EventsList`,
  `…PlayersList` — `useInfiniteQuery` paging on `p_offset`.
- Query keys added to `qk`: `qk.explore.{players,events,communities,groups}` (rail) and a
  paged key variant.
- Exported from `packages/api/src/index.ts`.
- Return-type shapes typed against the regenerated `database.types.ts` RPC signatures; a
  small `discovery` test (or additions to `schemas.test.ts`) asserts key shapes.

Hooks are `enabled: !!uid`, following the existing convention.

## Mobile UI

New bottom-nav **Explore tab** — repurpose the `(tabs)/two.tsx` placeholder into
`(tabs)/explore/index.tsx`; register the tab in `(tabs)/_layout.tsx` with an appropriate
SF Symbol (e.g. `safari`/`sparkle.magnifyingglass`).

- **`(tabs)/explore/index.tsx`** — a vertical scroll of four `SuggestionRail`s, an
  `ExploreHeader` carrying a search icon (rendered **inert/hidden** until the Search
  plan), and the floating **Create-Event FAB** → routes to the existing `/event/create`
  wizard.
- **`SuggestionRail`** — section title + "See all" link + a horizontal `FlashList` of
  cards. Per-type cards: `PlayerCard`, `EventCard` (reuse the existing list EventCard),
  `CommunityCard` (with the Request-to-join CTA when `privacy = 'request_to_join'`),
  `GroupCard`.
- **See-all: `(tabs)/explore/[type].tsx`** — a vertical paged `FlashList` over the
  infinite-query hook for `type ∈ {players,events,communities,groups}`.
- **Navigation on tap:** community → `/community/[id]`; group → `/group/[id]`; event →
  `/event/[id]`; community Request-to-join → existing `/community/[id]/join`; player →
  no-op/toast.
- **States:** per-rail loading (skeleton/spinner), empty (rail hidden or "nothing here
  yet" copy), error.

## i18n

New `discovery` namespace added in `apps/mobile/lib/i18n-mobile.ts` via
`registerMobileCopy` — rail titles ("Players you might know", "Events", "Communities",
"Groups"), "See all", "Request to join", empty/error states. English-only with fallback,
matching the `group`/`event` precedent.

## Conventions followed

- Sequential additive migration `infra/supabase/migrations/0052_explore_rpcs.sql` (next
  number); functions `set search_path = public`; grants to `authenticated`/`service_role`;
  user errors via `errcode='P0001'` where applicable.
- Run local Supabase with `--workdir infra` after `export
  SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token`; regenerate
  `packages/db/src/database.types.ts` after the migration.
- SQL tests under `infra/supabase/tests/*.sql` with the `set local role authenticated` +
  JWT-claims + `PT001` sentinel pattern.
- `@padel/api` exports raw TS from `src/index.ts`; strict TS (`import type`,
  `noUncheckedIndexedAccess`).
- All user-facing copy via `useT('discovery')`.

## Testing strategy

- **SQL:** the four `explore_*.sql` test files (visibility / exclusion / ordering /
  paging) — the primary correctness gate.
- **`@padel/api`:** schema/return-shape tests.
- **Type safety:** regenerated DB types compile against the new hooks.
- Manual smoke on the Explore tab (rails render, See-all pages, taps navigate, FAB opens
  the wizard) once migrations + hooks land.

## Explicitly deferred (NOT in this build)

- The Search overlay and its three states; `recent_searches`; scopes / "Searching in [X]"
  banner; the unified Filter sheet; the search icons on Home / Profile / Events-list; the
  "For you" tab and the per-tab filter interpretation matrix.
- Real **distance** ranking + geo columns + coordinate capture (onboarding GPS, create-flow
  pickers).
- The **follow system** and player-profile navigation (Players-rail tap stays a no-op).
- A standalone Home tab and the Find-Event/Group/Community quick actions.

## Open items for the implementation plan

- Confirm the exact column set each RPC must return to satisfy the existing card
  components (avoid over-selecting).
- Confirm `(tabs)/_layout.tsx` tab ordering and icon, and whether `two.tsx` is renamed or
  replaced.
- Confirm `/event/create` opens cleanly from the FAB without a group context (standalone
  path) or whether the FAB should route to a group-pick step first.
```
