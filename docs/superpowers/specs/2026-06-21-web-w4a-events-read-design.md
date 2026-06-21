# Web W4a — Events (read) — Design

**Slice:** First of five W4 sub-slices (W4a read → W4b participate → W4c create/edit → W4d manage → W4e live
match). Read-only events: browse your events, view an event's detail, view a completed event's result, and wire
the community + group **Events** tabs. No actions in this slice.

## Goal

Players browse their events and any event's detail (read-only) — including a completed event's result
leaderboard — on the existing backend via `@padel/api`. Action affordances render as disabled / "coming soon"
until later W4 slices.

## Routes (auth-gated)

### `/app/events` (replace the existing "coming soon" placeholder)
**Your Events.** shadcn `Tabs` **All / Organizing / Going** backed by `useMyEvents(filter)` where
`filter: 'all' | 'organizing' | 'going'` (the `MyEventsFilter` type). This is an **infinite query** over the
`my_events` RPC, which returns only **upcoming `scheduled` (starts_at ≥ now) + `in_progress`** events ordered by
`starts_at asc` — NOT completed events. Page size constant is internal to the hook.
- Each page is an array of `events` rows; flatten `data.pages` to render.
- An `EventCard` per row → `/app/event/[id]`.
- A **Load more** `Button` shown when `hasNextPage`, calling `fetchNextPage()` (disabled while
  `isFetchingNextPage`).
- Loading (first page) → `Skeleton`; empty → a friendly empty state (`emptyEvents`).
- A **New event** affordance is **omitted** in W4a (create lands in W4c).

### `/app/event/[id]` — event detail (READ-ONLY)
`useEvent(id)` (returns the `events` row plus `venue:venues(name, address)` join) + `useEventRealtime(id)` for
live updates. Hooks declared before any early return. Loading → `Skeleton`; `!event.data` → `notAvailable`.
- **Header** (inlined in the page, per the W3a precedent): title; a **status** `Badge`
  (`scheduled` / `in_progress` / `completed` → localized label); `starts_at` formatted as locale date + time
  (`Intl.DateTimeFormat` with the active i18n locale); venue (`venue.name` + `venue.address`, else
  `locationTbd`); organizer label; a **recurring** tag when the event is recurrent.
- **Details** section: fee (free vs formatted amount), format, scoring/match type — the read-only fields the
  mobile detail screen surfaces under its details/about sections. Render only the fields present on the row;
  do not invent fields. (Confirm exact column names — `fee_cents`/`format`/`scoring_type` etc. — against
  `useEvent`'s row / `database.types.ts` before wiring; omit any field that isn't present.)
- **Players** section: `useEventParticipants(id)` → rows `{ ..., profiles: {id, full_name, avatar_url}|null }`.
  Render avatar + name, **grouped by participant status** (`confirmed` vs `waiting_list`; show an "invited"
  group only if such rows are returned). Plus `useEventTeams(id)` — when the event has teams, render team
  groupings (team label + its members). If there are no teams, show the flat participant list.
- **Completed** (`event.data.status === 'completed'`): a **result leaderboard** from
  `useEventResultSummary(id)` → `{ rank, name, points }[]`, rendered as an `EventResultTable`.
- **Actions** (join / leave / partner / accept-invite / manage / start / view-matches): render as
  **disabled buttons or a "coming soon" note** — NO real mutations in W4a. Keep this minimal (a single disabled
  primary CTA + a "more coming soon" hint is enough); the full action set lands in W4b/W4d/W4e.

### Community Events tab (`/app/community/[id]`)
Replace the `events` `TabsContent` "coming soon" with `useCommunityEvents(id)` → an `EventCard` list (loading →
`Skeleton`; empty → message). Add `useCommunityEvents(id)` alongside the page's other hooks (before early
returns).

### Group Events tab (`/app/group/[id]`)
Replace the `events` `TabsContent` "coming soon" with `useGroupEvents(id)` → an `EventCard` list (same pattern).
Add `useGroupEvents(id)` alongside the existing hooks.

## Components (`apps/web/src/components/event/`)
- **`EventCard`** — props a normalized event `{ id, title, starts_at, status, venue?, thumbnail_path? }` (accept
  the raw `events` row fields it needs). A shadcn `Card` linking to `/app/event/${id}`: title, formatted date,
  venue/location, a status `Badge`. Mirrors `GroupCard`'s shape/style.
- **`EventParticipantsList`** — props `{ participants: {...profiles}[]; teams?: {...}[] }`. Avatar + name list
  grouped by status, or team groupings when teams exist. Avatars via `avatarUrl(profiles?.avatar_url)` (matches
  `GroupMembersList`).
- **`EventResultTable`** — props `{ rows: { rank: number; name: string|null; points: number }[] }`. A small
  rank / name / points table (mirrors `RankingTable`). Empty → friendly state.

New `event` i18n namespace registered in `lib/i18n-web.ts` (en/pt-PT/pt-BR) with a `registerWebEventCopy` call
added to `Providers.tsx` after `registerWebGroupCopy`.

## Reuse
`@padel/api`: `useMyEvents`, `useEvent`, `useEventParticipants`, `useEventTeams`, `useEventResultSummary`,
`useCommunityEvents`, `useGroupEvents`, `useEventRealtime`. `avatarUrl` (`@/lib/upload`); `communityImageUrl`
only if events carry a thumbnail path (verify; otherwise initials/icon fallback). shadcn
`Tabs`/`Card`/`Badge`/`Avatar`/`Skeleton`/`Button`/`Separator` (all present).

## Error / edge handling
- Loading → `Skeleton`; an event a user can't see (RLS → null) → `notAvailable`.
- Event with no participants / no result → friendly empty states.
- Date/venue/fee fields that are null → graceful fallbacks (`locationTbd`, `feeFree`).
- `useMyEvents` excludes completed events by design — completed events are reachable only via detail links
  (from community/group tabs or direct URL); the list empty state should not imply "no past events".

## i18n (new `event` namespace keys)
`title:'Events', filterAll:'All', filterOrganizing:'Organizing', filterGoing:'Going', emptyEvents:'You have no
upcoming events.', loadMore:'Load more', notAvailable:'This event is not available.', statusScheduled:'Scheduled',
statusInProgress:'In progress', statusCompleted:'Completed', detailsTitle:'Details', playersTitle:'Players',
aboutTitle:'About', feeLabel:'Fee', feeFree:'Free', formatLabel:'Format', scoringLabel:'Scoring',
organizerLabel:'Organizer', locationTbd:'Location to be confirmed', recurrentTag:'Recurring',
confirmedGroup:'Confirmed', waitlistGroup:'Waiting list', invitedGroup:'Invited', teamsTitle:'Teams',
resultTitle:'Result', rank:'#', points:'Points', emptyPlayers:'No players yet.', emptyResult:'No result yet.',
comingSoon:'Coming soon'` (translate pt-PT/pt-BR).

## Verification
`pnpm --filter web typecheck` + `build`; browser (local Supabase): `/app/events` lists my upcoming events; the
All/Organizing/Going tabs filter; Load more pages when there are >1 page. Open an event → header + details +
players (grouped by status, teams if any) render; an `in_progress` event shows its status; a **completed** event
shows its result leaderboard. The community detail **Events** tab and a group detail **Events** tab each list
events linking to `/app/event/[id]`.

## Out of scope (later W4 / W5)
Join / leave / waiting-list / partner / invitation actions (**W4b**); create + edit wizard (**W4c**); manage hub —
roster, payments, blast, activity log, cancel, duplicate (**W4d**); start event / generate rounds / live scoring /
timer / detailed standings / finish-publish (**W4e**); event chat (**W5**). Detailed rounds/standings read view is
deferred to W4e (needs team/player name resolution).
