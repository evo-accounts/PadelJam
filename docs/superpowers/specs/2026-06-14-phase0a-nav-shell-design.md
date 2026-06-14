# Phase 0A — 5-Tab Nav Shell + Events Tab — Design

*Padel Jam • 2026-06-14 • Brainstormed design / spec*

## Goal

Stand up the app's full bottom-navigation shell and a real **Events** list, as the first
slice of the remaining-requirements roadmap
(`/Users/joaopaulos4/.claude/plans/review-the-structure-files-cosmic-hammock.md`, Phase 0A).
Closes **HN-01** (five-tab nav: Home · Events · Explore · Community · Profile) and **HN-02**
(Create-Event FAB on Home/Events/Explore). Home and Profile ship as **placeholders** (their
full builds are roadmap Phases 3 and 1); the substantive new work is the **Events tab**,
backed by a new `my_events` ranking-style RPC.

This stacks on the shipped Explore work (branch `feat/discovery-explore`, PR #1) — it edits
the `explore` tab entry and reuses the Explore conventions (`SECURITY DEFINER` RPC, paged
hook, `EventCard`, i18n namespace).

## Scope decisions (made with the user)

1. **0A first, minimal.** Build the nav shell now; Profile tab is a stub until Phase 1,
   Home tab is a placeholder until Phase 3.
2. **Events tab = upcoming + 3 filter chips.** One screen listing the viewer's **upcoming**
   events with **All / Organizing / Going** chips. Past events and richer All/Organizing/Going
   *sub-tab* semantics from `join-manage-event.md` are deferred to Phase 5 gap-closing.
3. **New `my_events` RPC** (server-side) over client-side aggregation of
   `useCommunityEvents`/`useGroupEvents` — the latter would be N queries with no clean paging
   and can't express organizing-vs-going. Mirrors the trusted explore-RPC pattern.

## Architecture

```
(tabs)/_layout.tsx   5 tabs: Home · Events · Explore · Community · Profile  + per-tab FAB
   │
(tabs)/events.tsx  ── useMyEvents(filter)  [TanStack useInfiniteQuery]
   │                      db.rpc('my_events', { p_filter, p_limit, p_offset })
   ▼
Postgres  my_events(p_filter, p_limit, p_offset)  SECURITY DEFINER
   │  reads
events / event_participants  (re-applies visibility explicitly)
```

No new tables. One new migration (the RPC), one new `@padel/api` hook, three tab screens
(Home placeholder, Events, Profile stub), one extracted shared FAB component.

## Components

### Migration `infra/supabase/migrations/0053_my_events.sql`
- `my_events(p_filter text default 'all', p_limit int default 20, p_offset int default 0)`
  `returns setof events`, `language sql stable security definer set search_path = public`.
- **Candidates:** `events` where `deleted_at is null`, `status in ('scheduled','in_progress')`,
  `starts_at >= now()`, and the viewer is either the **organizer** (`organizer_id = auth.uid()`)
  or a **going** participant (`event_participants` row with a confirmed/going status).
- **Filter:** `p_filter = 'organizing'` → organizer only; `'going'` → participant only;
  `'all'` (or anything else) → union. Validate against the three known values; default to `all`.
- **Order:** soonest `starts_at` asc.
- **Paging:** `limit greatest(p_limit,0) offset greatest(p_offset,0)`.
- `grant execute on function my_events to authenticated;`
- *Note on visibility:* because `SECURITY DEFINER` bypasses RLS, the function only returns
  events the viewer organizes or already participates in — both are inherently theirs to see,
  so no broader visibility re-derivation is needed (unlike the explore discovery escape-hatch).

### SQL test `infra/supabase/tests/my_events.sql`
Established `set local role authenticated` + `set_config('request.jwt.claims',…)` + `PT001`
sentinel pattern. Assert: an organized upcoming event appears under `organizing` and `all`;
a going-participant event appears under `going` and `all`; `organizing` excludes going-only and
vice-versa; a **past** event (`starts_at < now()`) is excluded; a **deleted/cancelled** event is
excluded; an event the viewer neither organizes nor joined is excluded; `p_limit`/`p_offset`
paging works.

### Types
Regenerate `packages/db/src/database.types.ts` after the migration; confirm the `my_events`
signature lands (and no drift). *(Local caveat: the `supabase gen types` CLI currently crashes
on this machine — `CPU lacks AVX`; if regen can't run, hand-add the RPC signature consistent
with the explore RPCs and verify via typecheck.)*

### `@padel/api` — `useMyEvents`
- In `packages/api/src/events/queries.ts` (or a small `discovery`-style addition): `useMyEvents(filter: 'all'|'organizing'|'going')` using `useInfiniteQuery`, `db.rpc('my_events', { p_filter: filter, p_limit: PAGE_SIZE, p_offset })`, `getNextPageParam` on page length (same `nextOffset` idiom as `discovery/queries.ts`), `enabled: !!uid`.
- Query keys: `qk.myEvents(filter)` = `['my-events', filter]`. Export from `packages/api/src/index.ts`.

### Mobile screens
- **`(tabs)/index.tsx` (Home placeholder):** strip the `EditScreenInfo` / "Tab One" template and the info-modal `headerRight`; render a minimal "Home" shell (title + short "coming soon" note). Mount the shared FAB.
- **`(tabs)/events.tsx` (new):** header title from i18n; **All / Organizing / Going** chip row driving `useMyEvents`; vertical paged `FlashList` of `EventCard` (tap → `/event/[id]`); loading (spinner) / error / empty states mirroring `SuggestionRail`. Mount the shared FAB.
- **`(tabs)/profile.tsx` (new, stub):** minimal "Your profile — coming soon" screen; replaced in Phase 1.

### Shared FAB `apps/mobile/components/CreateEventFab.tsx`
Extract the inline floating Create-Event button from `(tabs)/explore.tsx` into a reusable
component (`onPress` → `router.push('/event/create')`, same styling/insets). Mount on Home,
Events, and Explore (replacing Explore's inline copy). Keeps HN-02 consistent and DRY.

### Nav shell `(tabs)/_layout.tsx`
Five `Tabs.Screen` in order **index (Home) · events · explore · community · profile**. Icons
(SF Symbols): `house.fill` · `calendar` · `safari` (existing) · `person.2.fill` (existing) ·
`person.crop.circle.fill`. Remove the template info-modal `headerRight` on Home. Titles via i18n.

### i18n `apps/mobile/lib/i18n-mobile.ts`
Add two English-only namespaces via `registerMobileCopy` (fallback like `discovery`/`event`/`group`):
- `home`: `{ tab: 'Home' }` (+ a placeholder line).
- `events`: `{ tab: 'Events', filterAll, filterOrganizing, filterGoing, empty, loadError }`.
Profile tab title can reuse a minimal `profile` namespace `{ tab: 'Profile' }`.

## Testing strategy
- **SQL:** `infra/supabase/tests/my_events.sql` (the correctness gate — filters/exclusions/paging).
- **`@padel/api`:** key-shape assertion for `qk.myEvents` (extend `discovery/queries.test.ts` or a sibling).
- **Types/typecheck:** regenerated types compile against `useMyEvents`; `pnpm -w typecheck`.
- **Manual smoke:** iOS simulator — five tabs render with correct icons/order; Events tab lists the viewer's upcoming events; filter chips switch results; FAB opens `/event/create` from Home/Events/Explore; Home & Profile show their placeholders.

## Explicitly deferred (NOT in this slice)
- Real Home (Phase 3) and real Profile (Phase 1).
- Events **past** section and full All/Organizing/Going *sub-tab* semantics (Phase 5 gap-closing).
- Any geo/distance work (Phase 0B).

## Conventions followed
Sequential additive migration `0053_my_events.sql`; function `set search_path = public`,
`grant execute … to authenticated`; SQL test with role/JWT-claims + `PT001` sentinel run via
`docker exec -i supabase_db_padeljam psql …`; regenerate `packages/db/src/database.types.ts`;
`@padel/api` thin TanStack hook wrapping `db.rpc` with `qk` keys, exported from `src/index.ts`;
strict TS; all copy via `useT(...)` namespaces; run local Supabase with `--workdir infra` after
`export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token`.

## Open items for the implementation plan
- Confirm the exact `event_participants` status value(s) that mean "going/confirmed" (read the
  events schema / existing join mutation) so `my_events` and the `going` filter match reality.
- Confirm whether `in_progress` events should appear in "upcoming" (proposed: yes — surface live
  events the viewer is in) and how `EventCard` renders them.
