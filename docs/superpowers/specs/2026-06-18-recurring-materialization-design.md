# Recurring Occurrence Materialization (A1) — Design

*Padel Jam • 2026-06-18 • Brainstormed design / spec*

## Goal

Let a **series organizer** turn the *next* recurring occurrence into a real, manageable `scheduled` event by
tapping the next-occurrence card on the event detail screen — so they can edit details and manage the roster
**before** it goes live — with the previous occurrence's invitees carried over as **pending** invitations.

Closes the user-requested half of the 5G-6 deferred list: *"make at least the next occurrence clickable so they
can manage before it creates the event in case they want to change something."*

## Scope decisions (from the brainstorm)

1. **Trigger = materialize-on-open.** No background job / cron (this stack has none). Tapping the card calls an
   RPC that creates the occurrence (or opens it if already created) and routes to Manage.
2. **Roster carry-over = invitations only.** The new occurrence re-invites the previous occurrence's invitee
   list as `pending`; confirmed participants are **not** copied.
3. **Access = organizer only → Manage screen.** The card is tappable only for the series organizer; tapping
   lands on the event Manage hub. Non-organizers keep the existing read-only card.
4. **No notifications on materialize.** The organizer is pre-managing; they invite/notify from Manage. Keeps
   "manage before it creates" intact and avoids a premature invite blast.

### Explicitly deferred (each a possible later slice)

- Rolling-window background materialization.
- Auto-invite at `invite_lead_days` (needs cron infra).
- Dormancy + discovery exclusion of un-materialized series.
- Edit-occurrence "this / this & future" (pairs with A2 edit-event).

## Verified context

- **`event_series`** ([0040_events_core.sql:4-15](../../../infra/supabase/migrations/0040_events_core.sql)):
  `id, group_id, organizer_id, day_of_week (1..7 ISO), start_time (time), duration_minutes, invite_lead_days
  (CHECK in (3,5,7)), is_active (default true), created_at, deleted_at`. Deactivated/soft-deleted by the
  `this_and_upcoming` cancel scope ([0073_cancel_event.sql](../../../infra/supabase/migrations/0073_cancel_event.sql)).
- **`events`** links via `series_id uuid` (FK→`event_series(id)` ON DELETE SET NULL); `status` CHECK in
  (`scheduled`,`in_progress`,`completed`,`cancelled`). A recurring event today is **one** `events` row + one
  `event_series` row — no future occurrences are pre-created.
- **`event_invitations`** ([0041_events_roster.sql](../../../infra/supabase/migrations/0041_events_roster.sql)):
  `id, event_id, invitee_id, invitee_name, invitee_email, invitee_phone, status
  (pending|accepted|declined|expired), invited_by, invited_at, responded_at`.
- **`event_participants`**: per-event roster (`status` invited|interested|confirmed|waiting_list, `is_standby`,
  …). **Not** copied by materialization.
- **Pure logic:** `nextWeeklyOccurrence(dayOfWeek, startTime, fromMs) → ISO`
  ([packages/utils/src/recurrence.ts](../../../packages/utils/src/recurrence.ts), tested in `recurrence.test.ts`).
  Currently the detail card calls it with `fromMs = Date.now()`.
- **Card UI today** ([event/[id]/index.tsx:172-176,543-548](../../../apps/mobile/app/event/[id]/index.tsx)):
  `useEventSeries(id)`; `isRecurring = series_id != null && series.is_active`; renders a **non-clickable**
  "Next occurrence" card from `nextWeeklyOccurrence(day, time, Date.now())`. Recurrent tag at lines 520-524.
- **Create template:** `create_event` ([0067_create_event_location.sql](../../../infra/supabase/migrations/0067_create_event_location.sql))
  is the column↔value reference for which event fields an occurrence carries.
- **`mapPgError`** allow-list pattern in `@padel/api`; hooks wrap `db.rpc`; `qk` keys; hand-edited
  `database.types.ts` (CLI gen crashes). Highest migration is **`0078`**; this slice uses **`0079`**.

## Architecture

### 1. Migration `0079_materialize_occurrence.sql`

**Idempotency guard** — a partial unique index so the same occurrence cannot be double-created (concurrent taps
or re-open):

```sql
create unique index if not exists events_series_slot_uniq
  on events (series_id, starts_at)
  where series_id is not null and deleted_at is null;
```

**RPC** `materialize_occurrence(p_after_event_id uuid) returns uuid`
(`security definer set search_path = public`):

- `v_user := auth.uid()`; raise `not authenticated` if null.
- Load source event `v_src` (by id, `deleted_at is null`); raise `event_not_found` (P0001) if missing.
- Require `v_src.series_id is not null`; load series `v_s`; require `v_s.organizer_id = v_user` else
  `forbidden` (P0001); require `v_s.is_active` and `v_s.deleted_at is null` else `series_inactive` (P0001).
- **Target slot:** `v_target := v_src.starts_at + interval '7 days'`. A weekly series is exactly 7 days apart,
  so this is the next occurrence after the source and matches what the card displays. *(DST wall-clock drift is
  a known limitation, consistent with today's `nextWeeklyOccurrence`.)*
- **Idempotent open:** `select id into v_existing from events where series_id = v_src.series_id and starts_at =
  v_target and deleted_at is null`. If found → `return v_existing`.
- **Insert** the new occurrence, copying the source's config and resetting the lifecycle:

```sql
insert into events (
  group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
  num_courts, starts_at, duration_minutes, organizer_role, name, description, thumbnail_path,
  status, is_private, counts_for_ranking, allow_standby, standby_spots,
  entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
  players_submit_results,
  location_venue_id, location_name, location_address  -- whatever location columns exist on events
)
select
  group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
  num_courts, v_target, duration_minutes, organizer_role, name, description, thumbnail_path,
  'scheduled', is_private, counts_for_ranking, allow_standby, standby_spots,
  entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
  players_submit_results,
  location_venue_id, location_name, location_address
from events where id = p_after_event_id
returning id into v_new;
```
*(The implementation plan will pin the exact `events` column list against
[0040_events_core.sql](../../../infra/supabase/migrations/0040_events_core.sql) +
[0067_create_event_location.sql](../../../infra/supabase/migrations/0067_create_event_location.sql); the list
above is illustrative. Roster/result/timer columns are NOT copied.)*

- **Copy invitations only** — clone the source event's invitations as fresh `pending`:

```sql
insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone,
                               status, invited_by, invited_at)
select v_new, invitee_id, invitee_name, invitee_email, invitee_phone,
       'pending', v_user, now()
from event_invitations where event_id = p_after_event_id;
```

- `return v_new;`
- `grant execute on function materialize_occurrence(uuid) to authenticated;`

No notifications are emitted. No `event_participants` rows are copied.

### 2. `database.types.ts`

Hand-add to `Functions`:
```ts
materialize_occurrence: { Args: { p_after_event_id: string }; Returns: string }
```

### 3. `@padel/api`

`events/mutations.ts` — `useMaterializeOccurrence(eventId)`:
```ts
export const useMaterializeOccurrence = (eventId: string) => {
  // const { data, error } = await db.rpc('materialize_occurrence', { p_after_event_id: eventId });
  // if (error) throw new Error(mapPgError(error) ?? 'unknown_error');  // returns new/existing event id
  // onSuccess: invalidate qk.event(eventId), qk.events(groupId?), qk.myEvents(*)
};
```
Add `series_inactive` (and confirm `forbidden`/`event_not_found`) to the `mapPgError` KNOWN allow-list.

### 4. Mobile — `apps/mobile/app/event/[id]/index.tsx`

- Change the card's `fromMs` from `Date.now()` to the **viewed event's `starts_at`** (ms), so it offers
  occurrence *N+1* rather than a slot that may coincide with the event being viewed.
- Gate interactivity on `event.organizer_id === me`:
  - **Organizer:** wrap the card in a `Pressable` → `useMaterializeOccurrence(id).mutateAsync()` →
    `router.push('/event/${newId}/manage')`. Show a pending state while the RPC runs; surface a mapped error
    inline on failure.
  - **Non-organizer:** render the existing read-only card unchanged.
- i18n (`event` namespace, English-only, PT/PT-BR deferred to A5): `materializeOccurrenceHint` (e.g. "Tap to
  set up this occurrence"), and error strings `series_inactive`.

## Error handling

- `materialize_occurrence` raises `forbidden` / `series_inactive` / `event_not_found` (P0001) → `mapPgError` →
  inline error on the card.
- The partial unique index backstops a concurrent double-tap: the loser hits a unique violation; the RPC's
  pre-check returns the existing row in the normal path, so the violation is only a race backstop (mapped to a
  generic error if it surfaces).

## Testing / verification

- **DB:** `db reset` clean; `infra/supabase/tests/materialize_occurrence.sql` → `OK materialize_occurrence`:
  - Organizer materializes → exactly one new `scheduled` event at source `starts_at + 7 days`, with copied
    config (assert a couple of fields, e.g. `name`, `num_courts`, `is_private`) and the source's invitations
    cloned as `pending`; **zero `event_participants`** on the new event.
  - **Second call** with the same `p_after_event_id` → returns the **same** event id; still one occurrence row
    (idempotent).
  - Non-organizer → `forbidden`. Inactive (`is_active=false`) series → `series_inactive`. Non-series event →
    `event_not_found`/guard error.
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`.
- **App smoke (simulator):** open a recurring event as organizer → tap the next-occurrence card → lands on
  Manage of the new occurrence; invitees show as pending, roster empty; re-tapping the original card opens the
  same occurrence (no duplicate). Non-organizer sees the read-only card.

## Conventions followed

Additive migration `0079`; RPC `security definer set search_path = public` + grant; SQL test `PT001`/`OK`;
hand-edited `database.types.ts`; thin `@padel/api` hook wrapping `db.rpc` + `mapPgError`; `qk` keys;
`useT('event')`; reuse `useEventSeries` + the existing card; `event_type`/`specification`/`series_id`/`group_id`
copied (not mutated). New occurrences inherit the source event's config verbatim except lifecycle (status reset
to `scheduled`, roster/results/timer cleared) and `starts_at` (+7 days).
