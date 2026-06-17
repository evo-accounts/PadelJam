# Phase 5G-6 — Recurring Tag/Card + Cancel Event — Design

*Padel Jam • 2026-06-17 • Brainstormed design / spec*

## Goal

Let an organizer **cancel** an event — a standard event (simple confirm) or a recurring one
("only this" / "this and upcoming") — notifying confirmed participants; and surface a **"recurrent"
tag + a "next occurrence" card** on recurring events. Closes **JM-34** (recurring cancel) and the
single-event cancel of **§4.9b**. Last slice of Phase 5G.

## Scope decisions (from the 5G-6 brainstorm)

1. **Light recurrence model** (no occurrence materialization): a recurring event shows a "recurrent"
   tag + a computed "next occurrence" card. "This and upcoming" cancel = cancel this event + deactivate
   the series so nothing recurs.
2. **Single-event cancel is included** — one `cancel_event(event_id, scope)` RPC handles both a standard
   event and a recurring one. This supersedes the `TODO(Phase 6f): cancel-event` in `manage.tsx`;
   **edit-event stays a 6f TODO.**
3. The next-occurrence card is **info-only (non-clickable)** for now (no materialized future event to
   open). See the explicit follow-up below.

## Verified context

- Highest migration is `0072`; this slice uses **`0073`**.
- Creating a recurring event today inserts **one** `events` row (the first occurrence) + an `event_series`
  row, with `events.series_id` set ([0067_create_event_location.sql:41](../../../infra/supabase/migrations/0067_create_event_location.sql#L41)).
  **No occurrence generator, no cancel RPC** exist anywhere.
- `event_series` ([0040_events_core.sql:4](../../../infra/supabase/migrations/0040_events_core.sql#L4)):
  `id, group_id, organizer_id, day_of_week (1–7), start_time, duration_minutes, invite_lead_days,
  is_active, created_at, deleted_at`. RLS read = group members; write = organizer.
- `events.status` CHECK domain is `('scheduled','in_progress','completed','cancelled')`
  ([0040:44](../../../infra/supabase/migrations/0040_events_core.sql#L44)); `'cancelled'` is unused today.
- `notifications` ([0061_notifications.sql:4](../../../infra/supabase/migrations/0061_notifications.sql#L4)):
  `id, user_id, type (CHECK list), actor_id, event_id, …, created_at`; producers insert rows via
  triggers/RPCs. **No `'event_cancelled'` type yet** — must be added to the CHECK.
- `my_events` ([0053_my_events.sql](../../../infra/supabase/migrations/0053_my_events.sql)) lists scheduled
  future events; a cancelled event (`status='cancelled'`) drops out automatically.
- `is_event_organizer(e, u)` exists. The event detail screen
  ([apps/mobile/app/event/[id]/index.tsx](../../../apps/mobile/app/event/[id]/index.tsx)) has the status
  badge + hero; `manage.tsx` ([line ~263](../../../apps/mobile/app/event/[id]/manage.tsx)) has the
  `TODO(Phase 6f)` cancel placeholder and a `run()` error wrapper.
- `@padel/utils` has vitest (`eventDeadlines.test.ts`, `rosterCsv.test.ts`).

## Architecture

### Migration `0073_cancel_event.sql`

- **Extend `notifications.type`**: drop the existing CHECK and recreate it adding `'event_cancelled'`
  (read the exact current list from `0061`/any later migration and append, preserving all existing values).
- **`cancel_event(p_event_id uuid, p_scope text default 'only_this')`** (`security definer set search_path
  = public`):
  - `v_user := auth.uid()`; load the event; if missing → `event_not_found`.
  - If not `is_event_organizer(p_event_id, v_user)` → `forbidden` (P0001).
  - If `status <> 'scheduled'` → `not_cancellable` (P0001).
  - If `p_scope not in ('only_this','this_and_upcoming')` → `invalid_scope` (P0001).
  - Cancel **this** event: `update events set status='cancelled' where id = p_event_id`.
  - Notify this event's confirmed participants: `insert into notifications (user_id, type, actor_id,
    event_id) select ep.user_id, 'event_cancelled', v_user, p_event_id from event_participants ep where
    ep.event_id = p_event_id and ep.status='confirmed' and ep.user_id is not null and ep.user_id <> v_user`.
    (Fill any other NOT-NULL `notifications` columns from `0061`.)
  - If `p_scope = 'this_and_upcoming'` and the event has a `series_id`:
    - Cancel **sibling** scheduled occurrences at/after this one and notify their confirmed participants:
      same status flip + notification insert for `events where series_id = v_ev.series_id and status =
      'scheduled' and starts_at >= v_ev.starts_at and id <> p_event_id`.
    - Deactivate the series: `update event_series set is_active=false, deleted_at=now() where id =
      v_ev.series_id`.
  - Grant execute to authenticated.
- **SQL test `cancel_event.sql`** (`PT001`/`OK`): a standard scheduled event → `cancel_event(ev,
  'only_this')` sets `status='cancelled'` and inserts one `event_cancelled` notification for a confirmed
  member; a recurring event → `cancel_event(ev, 'this_and_upcoming')` cancels it and sets
  `event_series.is_active=false`; a non-organizer caller → `forbidden`; cancelling an already-cancelled /
  completed event → `not_cancellable`.

### `@padel/utils`

`packages/utils/src/recurrence.ts` — `nextWeeklyOccurrence(dayOfWeek: number /* 1=Mon … 7=Sun, ISO */,
startTime: string /* 'HH:MM' */, fromMs: number): string` returns the ISO timestamp of the next weekly
slot **strictly after** `fromMs`. Vitest: a slot later this week, a slot earlier in the week (wraps to next
week), and the exact-now boundary (returns next week, strictly-after). Exported from the index.

### `@padel/api`

- `qk.eventSeries: (id: string) => ['event', id, 'series']`.
- `useEventSeries(eventId)` — read the `event_series` row for the event's `series_id`
  (`db.from('events').select('series_id, event_series(day_of_week, start_time, is_active)').eq('id',
  eventId).maybeSingle()` or a two-step), returning `{ day_of_week, start_time } | null`. Null when the
  event is not recurring.
- `useCancelEvent(eventId)` — `rpc('cancel_event', { p_event_id, p_scope })`; on success invalidates
  `qk.event(eventId)`, `qk.myEvents('all'|'organizing'|'going')`, and the group events list if known.
- `database.types.ts`: hand-add `cancel_event: { Args: { p_event_id: string; p_scope?: string }; Returns:
  undefined }`.

### Mobile

- **`event/[id]/index.tsx`** — when `event.series_id != null`:
  - a small **"Recurrent"** tag near the status badge (`recurrentTag`).
  - a **"Next occurrence"** info card (in the When/overview area): `useEventSeries(id)` →
    `nextWeeklyOccurrence(series.day_of_week, series.start_time, Date.now())` → `formatWhen(...)`.
    **Non-clickable** (light model). Hidden if the series is inactive/null.
- **`manage.tsx`** — replace the `TODO(Phase 6f)` cancel comment with a **"Cancel event"** button (red/
  destructive) in the section area. On press:
  - recurring (`event.series_id != null`): an Alert "Cancel recurring event" with **Only this** /
    **This and upcoming** / Cancel → `useCancelEvent` with the chosen scope.
  - standard: an Alert "Cancel this event?" confirm → `useCancelEvent('only_this')`.
  - On success: `router.back()` (the cancelled event drops out of lists). Errors via the existing `run()`
    Alert.
- **i18n** (`event` namespace, English-only): `recurrentTag` ("Recurrent"), `nextOccurrenceTitle` ("Next
  occurrence"), `cancelEventCta` ("Cancel event"), `cancelStandardTitle` ("Cancel this event?"),
  `cancelStandardBody` ("Confirmed players will be notified."), `cancelRecurringTitle` ("Cancel recurring
  event"), `cancelOnlyThisCta` ("Only this event"), `cancelThisAndUpcomingCta` ("This and upcoming events"),
  `not_cancellable` ("This event can no longer be cancelled."), `invalid_scope` (generic). (`forbidden`,
  `cancel`, `back` already exist.)

## Error handling

- `cancel_event` raises `forbidden`/`not_cancellable`/`invalid_scope`/`event_not_found` (P0001), surfaced
  via `mapPgError` + the existing error UI. Add the new codes to `mapPgError`'s `KNOWN` allow-list and the
  i18n `event` namespace.
- Next-occurrence card: hidden when `useEventSeries` is null or the series is inactive; never blocks render.

## Testing

- **DB:** `db reset` clean; `cancel_event.sql` → `OK cancel_event`.
- **Types/API/utils:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`; `pnpm --filter
  @padel/utils test` (`nextWeeklyOccurrence`).
- **App smoke (simulator):** cancel a standard event (confirm → event leaves lists, participants get a
  notification); cancel a recurring event "this and upcoming" (series deactivated); a recurring event shows
  the Recurrent tag + a correct Next-occurrence card.

## Explicitly deferred (documented follow-ups)

- **Make the next-occurrence card clickable (organizer):** the organizer should be able to **open and
  pre-manage / edit the upcoming occurrence before it materializes**, so they can adjust it ahead of time.
  This requires materializing (or virtualizing-then-materializing-on-open) the occurrence — a follow-up to
  the light model. (Player's card stays info-only.)
- Occurrence materialization (rolling ~3-month window), auto-invite at `invite_lead_days`, dormancy +
  discovery exclusion, open arbitrary future occurrences, edit-occurrence ("this / this & future").
- **JM-35** (organizer Join/Leave as a player without cancelling) — a separate organizer-participation
  concern; not part of cancel/recurring.
- Edit-event (the other half of the 6f TODO).

## Conventions followed

Additive migration `0073`; RPC `security definer set search_path = public` + grant; SQL test `PT001`/`OK`;
hand-edited `database.types.ts`; pure recurrence math in `@padel/utils` with vitest (mirrors
`eventDeadlines`); thin `@padel/api` hooks + `qk`; `useT('event')`; reuse `is_event_organizer`,
`formatWhen`, the `run()` wrapper, and the notifications-insert producer pattern.
