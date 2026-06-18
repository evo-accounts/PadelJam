# JM-35 — Organizer Plays (Join/Leave as a player) — Design

*Padel Jam • 2026-06-18 • Brainstormed design / spec*

## Goal

Let the organizer **Join as a player** / **Leave as a player** without cancelling the event, from the event
detail screen. Closes **JM-35** (*Must*). A small, fully-verifiable in-app gap.

## Scope decision (from the brainstorm)

**UI-only.** The backend already supports it — `join_event`/`leave_event` work for the organizer (no
special guard; leave just removes the participant row, never touches event status) and
`organizer_role='organizing_and_playing'` auto-inserts the organizer as a confirmed participant at
creation. No migration, no RPC, no new SQL test (the join/leave RPCs are unchanged and covered by
`infra/supabase/tests/event_join.sql`).

## Verified context

- `create_event` ([0046_create_event_rpcs.sql:63](../../../infra/supabase/migrations/0046_create_event_rpcs.sql#L63)):
  inserts the organizer as a `confirmed` participant **iff** `organizer_role='organizing_and_playing'`;
  `organizing_only` adds no row.
- `join_event` / `leave_event` ([0047_roster_rpcs.sql](../../../infra/supabase/migrations/0047_roster_rpcs.sql)):
  no organizer-specific blocking; `join_event` waitlists when full and respects the 6h cutoff; `leave_event`
  respects the 12h cutoff and only deletes the caller's participant row (no event cancellation).
- Detail screen ([apps/mobile/app/event/[id]/index.tsx](../../../apps/mobile/app/event/[id]/index.tsx)):
  derives `isOrganizer`, `me` (the viewer's participant row), `onJoin`, `onLeave`, and (from 5G-1)
  `joinClosed` / `leaveLocked` + `leaveByText`. The `isOrganizer && status==='scheduled'` CTA branch
  currently shows only Manage + Start and **never inspects `me`**. Team-spec join routes to
  `/event/${id}/partner-requests` (the existing `teamJoinCta`). `organizerBadge` ("You're organizing")
  already exists.
- Requirement §4.8 / matrix §3.2: organizing_only → "Join as a player"; organizing_and_playing → already a
  player, can "Leave Event as a player" without cancelling.

## Architecture

All changes in `apps/mobile/app/event/[id]/index.tsx` (the `isOrganizer` CTA branch, `status==='scheduled'`)
+ i18n.

- **Badge:** `me != null ? t('organizerPlayingBadge') : t('organizerBadge')`.
- **Manage** and **Start** buttons: unchanged.
- **Not playing** (`me == null`):
  - non-team event: a **"Join as a player"** button → `onJoin` (existing; `join_event` waitlists if full).
  - team event (`event.specification === 'team'`): a **"Join as a player"** button → `router.push('/event/${id}/partner-requests')`.
  - the button is **hidden when `joinClosed`** (past the 6h cutoff) — consistent with the player join path.
- **Playing** (`me != null`):
  - **before the leave cutoff** (`!leaveLocked`): a **"Leave as a player"** button → `onLeave`, with the
    existing subtle "You can leave until {when}" hint (`leaveByHint` + `leaveByText`).
  - **when `leaveLocked`** (past 12h): the Leave-as-player button is **hidden** (the organizer can still
    remove themselves via Manage; the player-facing "message organizer" affordance is not applicable to the
    organizer).
- Buttons render in the existing `ctaCol` (secondary-button style), beneath Manage/Start; busy/error use the
  existing `run()` wrapper that already wraps `onJoin`/`onLeave`.

### i18n (`event` namespace, English-only `mobileEvent.en`)

- `organizerPlayingBadge` — "You're organizing and going!"
- `joinAsPlayerCta` — "Join as a player"
- `leaveAsPlayerCta` — "Leave as a player"

(`organizerBadge`, `leaveByHint`, `manageCta`, `startCta`, `teamJoinCta` already exist.)

## Error handling

- Boundary races (join/leave exactly at a cutoff) still surface the server's `event_closed` /
  `leave_deadline_passed` via the existing `{error}` line — unchanged.
- A team-spec organizer joining goes through the existing partner-requests flow (no new path).
- Full event → `onJoin` → `join_event` returns `waiting_list`; the organizer lands on the waitlist like any
  player (acceptable; they can also Manage).

## Testing / verification

- **Types:** `pnpm -w typecheck` (13/13). No `@padel/api`/SQL changes.
- **App smoke (simulator):** an `organizing_only` organizer sees "You're organizing" + "Join as a player";
  tapping joins (appears in the confirmed list) and the CTA flips to "You're organizing and going!" +
  "Leave as a player"; leaving removes them and the event is **not** cancelled; past the 6h/12h cutoffs the
  respective button is hidden.

## Explicitly out of scope / deferred

A dedicated "More menu" (the spec's wording — a button suffices for the Must); changing
`organizer_role` after creation; any backend change (none needed).

## Conventions followed

`useT('event')`; reuse the existing `me`/`isOrganizer`/`onJoin`/`onLeave`/`run()` and the 5G-1
`joinClosed`/`leaveLocked`/`leaveByText` derivations; English-only `event` namespace; no migration/RPC
(backend already supports JM-35 and is covered by `event_join.sql`).
