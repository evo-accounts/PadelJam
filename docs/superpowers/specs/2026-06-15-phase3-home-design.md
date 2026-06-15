# Phase 3 — Home tab — Design

*Padel Jam • 2026-06-15 • Brainstormed design / spec*

## Goal

Replace the placeholder Home tab (`(tabs)/index.tsx`) with the real Home aggregator
(HN-03..08): a header with the notification bell, a quick-actions row, the user's Next
Events + My groups, and — for users with no activity — Suggested events/groups with an
add-location banner. Plus a minimal **Your-Groups list** screen as the My-groups "See all"
target.

Home stores no new data of its own; it aggregates existing tables. The one new DB object is
a `my_groups()` RPC (there is currently no global "groups across all communities" query).

## Scope decisions (made with the user)

1. **Suggestions reuse the existing Explore rails** (`explore_events`/`explore_groups`, which
   rank by recency + co-membership + same-country — **not distance**). 0B's geo-DB (entity
   coords + a distance/nearby RPC) was never built; only viewer-side `profiles.location_point`
   capture shipped via onboarding. True distance ranking folds in later when 0B-DB lands. The
   add-location banner still appears when the viewer has no location.
2. **Header: bell only.** Relocate the working `NotificationBell` (Phase 2A, currently on the
   Profile tab) to the Home header. The spec's Chat + Search header icons are **omitted** until
   Phase 4 (Chat) and the deferred Discovery-search redesign — no dead affordances.
3. **Build a minimal Your-Groups list now** as the My-groups See-all target (partially closes
   GR-12). Backed by a new `my_groups()` RPC.
4. **Find actions route to Explore see-all** (`/explore/events|groups|communities`), not a
   global search overlay (HN-09 search is deferred with Discovery).
5. **Add-location banner reuses the onboarding location step** (`/(onboarding)/location`), which
   already captures GPS + reverse-geocodes + persists to `profiles`. A dedicated in-profile
   location editor is a follow-up.

## Verified current state
- `(tabs)/index.tsx` is a placeholder (renders `home.placeholder` + `<CreateEventFab />`).
- `useMyEvents(filter)` exists → RPC `my_events(p_filter,p_limit,p_offset)`; **`'going'`** = upcoming confirmed (Next Events, HN-05).
- **No** global my-groups query (`useMyGroupMemberships` is per-community) → new `my_groups()` RPC.
- `useExploreEvents` / `useExploreGroups` exist (rails, limit 10) for Suggested sections.
- `useMyProfile` selects bio fields but **not** `location_text` → add it for the has-location check.
- `NotificationBell` is mounted on the Profile tab's `Tabs.Screen` headerRight (Phase 2A) → relocate to Home.
- Explore see-all route is `/explore/[type]` (`type` ∈ events|groups|communities|players).
- Migration numbers `0061` (merged, 2A), `0062`/`0063` (unmerged, 2B branch) are taken → **this phase uses `0064`**.

## Architecture / components

```
(tabs)/index.tsx  (Home — composes hooks, no dedicated aggregator hook)
  header: "Home" + NotificationBell (via home Tabs.Screen headerRight in _layout.tsx)
  QuickActions row: Create Event | Find Event | Find Group | Find Community
  if (myEvents.length || myGroups.length):           // with activity
     NextEvents preview (horizontal)  → See all → Events tab
     MyGroups preview                 → See all → /groups (Your-Groups list)
  else:                                               // empty state
     if (!profile.location_text) AddLocationBanner → /(onboarding)/location
     SuggestedEvents (useExploreEvents) + SuggestedGroups (useExploreGroups)

/groups/index.tsx  (Your-Groups list — useMyGroups, FlashList, row → /group/[id])
```

### DB — `infra/supabase/migrations/0064_my_groups.sql`
`my_groups()` — `language sql stable security definer set search_path = public`, `grant execute
… to authenticated`. Returns the caller's groups across all communities:

```
returns table (group_id uuid, name text, community_id uuid, community_name text, member_count int)
  select g.id, g.name, c.id, c.name, (select count(*) from group_members gm2 where gm2.group_id = g.id)
  from group_members gm
  join groups g       on g.id = gm.group_id and g.archived_at is null
  join communities c  on c.id = g.community_id
  where gm.user_id = auth.uid()
  order by g.name;
```
SQL test (`infra/supabase/tests/my_groups.sql`): a member sees their group with the right
`community_name` + `member_count`; a non-member sees 0 rows. Hand-add the function type to
`database.types.ts`.

### `@padel/api`
- `useMyGroups()` in `packages/api/src/groups/queries.ts` — `useQuery` wrapping `db.rpc('my_groups')`,
  `enabled: !!uid`, returns `MyGroup[]`. New query key `qk.myGroups`.
- Add `location_text` to the `useMyProfile` select (`packages/api/src/profile/queries.ts`).

### Mobile
- **`apps/mobile/app/(tabs)/index.tsx`** — the Home screen described above. Quick actions use the
  codebase palette + `SymbolView` icons. "Create Event" reuses the existing create-event navigation
  (as `CreateEventFab` does). The with-activity vs empty branch waits for both `useMyEvents('going')`
  and `useMyGroups()` to settle; each section renders its own loading/error/empty fallback.
- **`apps/mobile/app/(tabs)/_layout.tsx`** — add `headerRight: () => <NotificationBell />` to the
  **home** `Tabs.Screen`; **remove** it from the **profile** `Tabs.Screen`.
- **`apps/mobile/app/groups/index.tsx`** — Your-Groups list (FlashList of `useMyGroups`, each row:
  group name + community name + member count, tap → `/group/[id]`; loading/error/empty states).
- **i18n** — extend the existing `home` namespace: `title`, `quickCreate`, `findEvent`, `findGroup`,
  `findCommunity`, `nextEvents`, `myGroups`, `seeAll`, `suggestedEvents`, `suggestedGroups`,
  `addLocationTitle`, `addLocationBody`, `addLocationCta`, `yourGroups`, `groupsEmpty`,
  `eventsEmpty`, `loadError`, `memberCount` (plural).
- Reuse existing event/group card components from the Explore rails where they fit; otherwise small
  local preview cards.

## Error handling
- Each section (Next Events, My groups, Suggested, Your-Groups list) shows an independent spinner
  while loading, an error line on failure, and an empty fallback — no whole-screen failure.
- The activity-vs-empty decision treats still-loading as "not yet decided" (show a top-level spinner
  until both `useMyEvents` and `useMyGroups` have data) to avoid flashing the empty state.
- Quick-action navigation and the banner CTA are plain `router.push`; no async failure paths.

## Explicitly deferred / follow-ups
- **Distance-ranked suggestions** (HN-08 "near them") — needs 0B-DB (entity coords + distance RPC).
  Suggestions are relevance-ranked until then.
- **Chat + Search header icons** (HN-03) — Phase 4 / deferred Discovery-search.
- **Full Your-Groups list** (All/Managing/Participating filters, GR-12) — this phase ships a minimal
  single list; filters/seasons are Phase 5.
- **In-profile location editor** — the banner reuses the onboarding step for now.
- **PT/PT-BR translations** for the new `home` keys (English-only, like the other namespaces).

## Conventions followed
Additive migration `0064`; RPC `security definer set search_path = public` + `grant execute …`;
SQL test with `set_config` role/jwt + `PT001` sentinel; hand-edit `database.types.ts`; thin
TanStack hooks wrapping `db.rpc`; `qk` query keys; per-tab header via `Tabs.Screen` options;
copy via a `useT('home')` namespace; FlashList for lists (v2 — no `estimatedItemSize`).
