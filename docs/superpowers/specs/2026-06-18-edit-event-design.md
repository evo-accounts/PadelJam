# Edit Event (JM-24) — Design

*Padel Jam • 2026-06-18 • Brainstormed design / spec*

## Goal

Let an organizer edit a **scheduled** event's details from a single sectioned Edit screen reached from the
Manage hub. Closes the editable-fields portion of **JM-24** (*Must*). Replaces the bigger half of the
`TODO(Phase 6f)` (the cancel half shipped in 5G-6).

## Scope decisions (from the brainstorm)

1. **One sectioned Edit screen** (Details / Date & Time / Scoring / Preferences) with a single Save → one
   `update_event` call.
2. **All editable fields except Location & Courts.** `event_type` + `specification` are immutable (JM-24);
   Location & Courts (venue/manual switch + court picker + `num_courts` capacity guard) and thumbnail
   re-upload are deferred follow-ups.
3. Editing allowed only while `status='scheduled'`.

## Verified context

- **JM-24** (Must): "event_type … and specification … are immutable once created. Every other variable can
  be edited. Edits are allowed while scheduled; once in progress or completed, editing is locked."
- `events` columns + CHECKs ([0040_events_core.sql](../../../infra/supabase/migrations/0040_events_core.sql)):
  `events_standalone_private` (`group_id is not null or is_private`), `events_venue_xor_manual`,
  `events_fee_complete` (fee enabled ⇒ amount + method). `num_courts`/`standby_spots` drive capacity
  (`num_courts*4 + standby_spots`).
- `create_event` ([0067_create_event_location.sql](../../../infra/supabase/migrations/0067_create_event_location.sql))
  is the column↔payload template; `buildCreateEventPayload`/`createEventSchema`
  ([packages/api/src/schemas.ts](../../../packages/api/src/schemas.ts)) the camelCase↔snake_case pattern;
  `updateGroupSchema = createGroupSchema.partial().omit(...)` is the existing update-schema pattern. **No
  `update_event` RPC / `useUpdateEvent` exists.**
- Manage hub ([apps/mobile/app/event/[id]/manage.tsx](../../../apps/mobile/app/event/[id]/manage.tsx)):
  organizer-gated; the `TODO(Phase 6f)` slot sits just above the Cancel-event button. The detail screen's
  `useEvent(id)` returns the full row for prefill.
- The create wizard is a 10-step context flow ([components/event/wizard](../../../apps/mobile/components/event/wizard));
  per the exploration we build a focused edit form rather than reuse the full wizard (Step7's date/time
  picker pattern is the reference for Date & Time).
- Highest migration is `0077`; this slice uses **`0078`**.

## Architecture

### 1. Migration `0078_update_event.sql`

```sql
-- JM-24: organizer edits a scheduled event's mutable fields. event_type/specification/num_courts/location/
-- group_id/series are NOT touched here. The client sends the full editable snapshot (one Save).
create or replace function update_event(p_event_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_allow_standby boolean; v_standby int; v_private boolean; v_standby_have int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_editable' using errcode='P0001'; end if;

  v_allow_standby := coalesce((p_payload->>'allow_standby')::boolean, false);
  v_standby := nullif(p_payload->>'standby_spots','')::int;
  -- standalone events must stay private (events_standalone_private)
  v_private := case when v_ev.group_id is null then true
                    else coalesce((p_payload->>'is_private')::boolean, false) end;

  -- Capacity guard: don't strand current standby players by lowering/disabling standby.
  select count(*) into v_standby_have from event_participants where event_id=p_event_id and is_standby;
  if v_standby_have > 0 and (not v_allow_standby or coalesce(v_standby,0) < v_standby_have) then
    raise exception 'standby_below_roster' using errcode='P0001';
  end if;

  update events set
    name                    = btrim(p_payload->>'name'),
    description             = p_payload->>'description',
    thumbnail_path          = p_payload->>'thumbnail_path',
    starts_at              = (p_payload->>'starts_at')::timestamptz,
    duration_minutes       = (p_payload->>'duration_minutes')::int,
    scoring_mode           = p_payload->>'scoring_mode',
    scoring_value          = nullif(p_payload->>'scoring_value','')::int,
    allow_standby          = v_allow_standby,
    standby_spots          = case when v_allow_standby then v_standby else null end,
    is_private             = v_private,
    entrance_fee_enabled   = coalesce((p_payload->>'entrance_fee_enabled')::boolean, false),
    entrance_fee_amount    = nullif(p_payload->>'entrance_fee_amount','')::numeric,
    entrance_fee_method    = nullif(p_payload->>'entrance_fee_method',''),
    entrance_fee_mba_number = p_payload->>'entrance_fee_mba_number',
    players_submit_results = coalesce((p_payload->>'players_submit_results')::boolean, false),
    organizer_role         = p_payload->>'organizer_role'
  where id = p_event_id;
end; $$;

grant execute on function update_event(uuid, jsonb) to authenticated;
```
Validation not handled inline (name non-empty, fee completeness, scoring mode/value, organizer_role enum) is
caught by `updateEventSchema` client-side **and** the `events_*` CHECK constraints server-side (a bad payload
raises a CHECK violation mapped to a generic error). The `name` set uses `btrim` (NOT NULL column).

- `database.types.ts`: add `update_event: { Args: { p_event_id: string; p_payload: Json }; Returns: undefined }`.
- **SQL test `update_event.sql`**: organizer edits name/starts_at/scoring_mode → row reflects it; a
  non-organizer → `forbidden`; an `in_progress` event → `not_editable`; with a standby participant present,
  setting `allow_standby=false` (or `standby_spots` below the count) → `standby_below_roster`; a standalone
  event payload with `is_private=false` stays private (forced) — assert `is_private=true` after.

### 2. `@padel/api`

In `schemas.ts`:
```ts
export const updateEventSchema = z.object({
  name: z.string().trim().min(1, 'name_required').max(80),
  description: z.string().trim().max(500).optional(),
  thumbnailPath: z.string().optional(),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  scoringMode: z.enum(SCORING_MODES),
  scoringValue: z.number().int().nullable(),
  allowStandby: z.boolean(),
  standbySpots: z.number().int().optional(),
  isPrivate: z.boolean(),
  entranceFee: z.object({
    enabled: z.boolean(),
    amount: z.number().optional(),
    method: z.enum(ENTRANCE_FEE_METHODS).optional(),
    mbaNumber: z.string().trim().optional(),
  }),
  playersSubmitResults: z.boolean(),
  organizerRole: z.enum(ORGANIZER_ROLES),
}).refine((v) => !v.entranceFee.enabled || (v.entranceFee.amount != null && !!v.entranceFee.method), {
  path: ['entranceFee'], message: 'fee_requires_amount_and_method',
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export function buildUpdateEventPayload(input: UpdateEventInput): Record<string, unknown> { /* camelCase→snake_case for the subset, mirroring buildCreateEventPayload */ }
```
In `events/mutations.ts`:
```ts
export const useUpdateEvent = (eventId: string) => {
  // db.rpc('update_event', { p_event_id: eventId, p_payload: buildUpdateEventPayload(input) as Json })
  // throw mapPgError on error; onSuccess invalidate qk.event(eventId), qk.events(groupId?), qk.myEvents(*)
};
```

### 3. Mobile — `apps/mobile/app/event/[id]/edit.tsx`

- `useEvent(id)` for prefill; local form state seeded from the row. One scrollable screen, sections:
  - **Details:** name (TextInput, required), description (multiline). (Thumbnail passed through unchanged —
    no picker.)
  - **Date & Time:** date + time picker + duration (reuse the Step7 schedule picker pattern).
  - **Scoring:** scoring_mode selector (points/time/classic) + scoring_value (numeric; hidden/none for classic).
  - **Preferences:** allow_standby toggle (+ standby_spots when on); is_private toggle (**disabled when
    `event.group_id == null`**, forced on); entrance fee (enabled toggle → amount + method + optional mba);
    players_submit_results toggle; organizer_role selector.
- **Save** → `updateEventSchema.safeParse(form)` → `useUpdateEvent(id).mutateAsync(parsed)` → `router.back()`;
  errors surfaced inline (mapPgError keys + `name_required`/`fee_requires_amount_and_method`/`standby_below_roster`).
- **Manage:** at the `TODO(Phase 6f)` slot, add an **"Edit event"** button (secondary), shown only when
  `event.status === 'scheduled'`, → `router.push('/event/${id}/edit')`. Register the route if the event stack
  enumerates screens (file-based routing auto-registers otherwise).
- `mapPgError` allow-list: add `not_editable`, `standby_below_roster` (`forbidden`/`event_not_found` already present).
- i18n (`event` namespace): `editEventCta`, section titles + field labels (reuse existing create-wizard
  labels where they exist), `not_editable`, `standby_below_roster`, `name_required`,
  `fee_requires_amount_and_method`.

## Error handling

- `update_event` raises `forbidden`/`not_editable`/`standby_below_roster`/`event_not_found` (P0001) →
  `mapPgError` → inline error.
- A CHECK violation (e.g. fee incomplete slipping past the client) → generic `unknown_error`; the client
  schema prevents the common cases first.
- Standalone privacy is force-true server-side, so a stale client can't make a standalone event public.

## Testing / verification

- **DB:** `db reset` clean; `update_event.sql` → `OK update_event`.
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`.
- **App smoke (simulator):** open Manage on a scheduled event → Edit event → change name/time/scoring/
  preferences → Save → detail reflects it; the Edit button is hidden once the event is in progress/completed;
  standby can't be reduced below the current standby roster.

## Explicitly deferred

Location & Courts editing (venue/manual XOR + court picker + `num_courts`/standby recalculation beyond the
guard); thumbnail re-upload (storage); the recurring "this / this & future" edit prompt (§4.6, pairs with
deferred occurrence materialization); re-notifying participants on a date/location change; PT/PT-BR copy.

## Conventions followed

Additive migration `0078`; RPC `security definer set search_path = public` + grant; SQL test `PT001`/`OK`;
hand-edited `database.types.ts`; `updateEventSchema`/`buildUpdateEventPayload` mirroring the create
equivalents (and the `updateGroupSchema` partial pattern); `useT('event')`; reuse `useEvent` prefill, the
Step7 date/time picker pattern, and `mapPgError`. event_type/specification/num_courts/location/group_id/
series are never written by `update_event`.
