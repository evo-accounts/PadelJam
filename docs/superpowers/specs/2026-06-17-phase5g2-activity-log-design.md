# Phase 5G-2 — Event Activity Log — Design

*Padel Jam • 2026-06-17 • Brainstormed design / spec*

## Goal

Record roster-core changes on an event and show them on a dedicated, organizer-only Activity log
screen reached from the Manage hub. Closes **JM-40** ("An Activity log records roster and edit changes
on the event.", *Could*).

Second slice of Phase 5G (Manage-Event), built sub-slice by sub-slice. (5G-1 deadlines is done on its
own branch.)

## Scope decisions (from the 5G-2 brainstorm)

1. **Logging mechanism = client-fired RPC.** A thin `log_event_activity` RPC is called from each
   relevant `@padel/api` mutation after the real action succeeds. The 12 existing roster RPCs are left
   untouched (lowest regression risk for a *Could* feature). Logging is **best-effort** — a logging
   failure never fails the action; server-side cascades (e.g. partner auto-demotion on a team leave)
   are not individually logged.
2. **Action set = roster core:** `joined`, `left`, `confirmed`, `removed`, `guest_added`,
   `marked_paid`, `marked_unpaid`, `marked_all_paid`. (Invitation/team actions deferred; edit-event is 6f.)
3. **UI = dedicated screen** `event/[id]/activity.tsx`, reached from a row on `manage.tsx`.
4. **Read visibility = organizer only.**

## Verified context

- `event_activity` does **not** exist yet. Highest migration is `0069`; this slice uses **`0070`**
  (reserved for 5G in the roadmap).
- Helpers exist and take `(event_id, user)`: `is_event_organizer(event_id, uuid)` and
  `event_is_visible(event_id, uuid)` (used throughout `0047_roster_rpcs.sql` /
  `0044_events_helpers_rls.sql`).
- Roster RPCs (all SECURITY DEFINER) and their wrapping hooks
  ([packages/api/src/events/mutations.ts](../../../packages/api/src/events/mutations.ts)):
  `join_event` **returns the status text** (`'confirmed'|'waiting_list'`), `leave_event`,
  `organizer_mark_confirmed`, `organizer_remove_participant(p_participant_id, p_mode)`,
  `add_manual_participant(p_event_id, p_name, p_gender)`, `mark_paid(p_participant_id, p_paid)`,
  `mark_all_paid(p_event_id)`. `useJoinEvent`/`useLeaveEvent` take the event id in the mutate call;
  `useMarkConfirmed`/`useRemoveParticipant`/`useAddManualParticipant`/`useMarkPaid`/`useMarkAllPaid` are
  `(eventId)`-scoped.
- Manage screen ([apps/mobile/app/event/[id]/manage.tsx](../../../apps/mobile/app/event/[id]/manage.tsx))
  is organizer-gated, renders the roster with participant names available, and has a Duplicate-Event CTA
  near the bottom — the natural place for an "Activity log" entry row.
- `qk` query keys: `eventParticipants(id)`, `eventInvitations(id)`, … — add `eventActivity(id)`.

## Architecture

### Migration `0070_event_activity.sql`

```sql
create table event_activity (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  actor_id   uuid references profiles(id),
  action     text not null,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index event_activity_event_idx on event_activity(event_id, created_at desc);
alter table event_activity enable row level security;

-- Read: organizer only (it's a management tool on the organizer-only Manage hub).
create policy "activity: read" on event_activity for select
  using (is_event_organizer(event_id, auth.uid()));
-- No insert/update/delete policy: writes go only through the SECURITY DEFINER RPC below.

create or replace function log_event_activity(
  p_event_id uuid, p_action text, p_detail jsonb default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_organizer_actions text[] := array[
    'confirmed','removed','guest_added','marked_paid','marked_unpaid','marked_all_paid'];
  v_self_actions text[] := array['joined','left'];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not (p_action = any(v_organizer_actions) or p_action = any(v_self_actions)) then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_action = any(v_organizer_actions) then
    if not is_event_organizer(p_event_id, v_user) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  else
    if not event_is_visible(p_event_id, v_user) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  end if;
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, p_action, coalesce(p_detail, '{}'::jsonb));
end; $$;

grant execute on function log_event_activity to authenticated;
```

`actor_id` is always `auth.uid()` (never client-supplied) — a player cannot forge organizer entries.

- **`database.types.ts`**: hand-add the `event_activity` Row/Insert/Update + the
  `log_event_activity: { Args: { p_event_id: string; p_action: string; p_detail?: Json }; Returns: undefined }`
  function entry.
- **SQL test `event_activity.sql`**: organizer `log_event_activity(ev,'confirmed',…)` inserts a row;
  a non-organizer participant calling it with `'removed'` raises `forbidden`; a participant calling
  `'joined'` inserts; reading `event_activity` as a non-organizer returns 0 rows; reading as organizer
  returns the inserted rows. `PT001` sentinel + `OK event_activity`.

### `@padel/api`

- `qk.eventActivity(id) = ['event', id, 'activity']`.
- `useEventActivity(eventId)` (queries.ts): select
  `*, profiles:actor_id (full_name, avatar_url)` from `event_activity`, `eq event_id`,
  `order created_at desc`; `.returns<ActivityRow[]>()` where a row carries `action`, `detail`,
  `created_at`, and the embedded actor profile.
- **Best-effort logging** in mutations.ts — after the existing `db.rpc(...)` succeeds, before/within
  `return`, wrap a log call so it can never throw into the action:
  ```ts
  async function logActivity(db, p_event_id, p_action, p_detail = {}) {
    try { await db.rpc('log_event_activity', { p_event_id, p_action, p_detail }); } catch { /* best-effort */ }
  }
  ```
  - `useJoinEvent`: `await logActivity(db, eventId, 'joined', { status })` (status = the returned text).
  - `useLeaveEvent`: `'left'`.
  - `useMarkConfirmed(eventId)`: input gains optional `targetName?: string` → `'confirmed'`, `{ target_name }`.
  - `useRemoveParticipant(eventId)`: input `{ participantId, mode, targetName? }` → `'removed'`, `{ target_name, mode }`.
  - `useAddManualParticipant(eventId)`: → `'guest_added'`, `{ guest_name: name }`.
  - `useMarkPaid(eventId)`: input `{ participantId, paid, targetName? }` → `paid ? 'marked_paid' : 'marked_unpaid'`, `{ target_name }`.
  - `useMarkAllPaid(eventId)`: → `'marked_all_paid'`.
  - Each logging mutation also invalidates `qk.eventActivity(eventId)` in `onSuccess` (alongside its
    existing invalidations) so the log screen refreshes.

### Mobile

- **`apps/mobile/app/event/[id]/activity.tsx`** (new): `useEventActivity(id)`, a `FlashList` of rows.
  Each row: actor avatar (initial fallback), a localized sentence, and a relative timestamp. Empty state
  (`activityEmpty`) when there are no rows (also the non-organizer case, since RLS returns nothing).
  Header title `activityTitle`. Mirror existing list-screen styling on the event screens.
- **`manage.tsx`**: add an "Activity log" row near the Duplicate-Event CTA →
  `router.push('/event/${id}/activity' as never)`.
- **i18n** (`event` namespace, English-only `mobileEvent.en`): one templated line per action —
  `activityJoined` ("{{actor}} joined"), `activityLeft` ("{{actor}} left"),
  `activityConfirmed` ("{{actor}} confirmed {{target}}"), `activityRemoved` ("{{actor}} removed {{target}}"),
  `activityGuestAdded` ("{{actor}} added {{target}}"),
  `activityMarkedPaid` ("{{actor}} marked {{target}} as paid"),
  `activityMarkedUnpaid` ("{{actor}} marked {{target}} as unpaid"),
  `activityMarkedAllPaid` ("{{actor}} marked everyone as paid") — plus `activityTitle`, `activityEmpty`,
  and `activityLogCta` ("Activity log") for the manage row. Render maps `row.action` → key, with
  `actor = profiles.full_name ?? 'Someone'` and `target = detail.target_name ?? detail.guest_name ?? '—'`.

## Error handling

- Logging RPC failure: swallowed (`logActivity` catch) — the user-facing action still succeeds.
- Unknown/forged action: `log_event_activity` raises `invalid_action`/`forbidden`; since the call is
  best-effort and fire-after-success, this only drops a log entry.
- Non-organizer opening `/activity` (e.g. deep link): RLS returns 0 rows → empty state.

## Testing

- **DB:** `db reset` clean; `event_activity.sql` prints `OK event_activity` (authorization + read
  visibility assertions).
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`.
- **App smoke (simulator):** as organizer, confirm/remove/add-guest/mark-paid on the manage screen, open
  Activity log, see the entries with correct actor/target text; a non-organizer viewing the event sees
  no activity affordance / empty log.

## Explicitly out of scope

Edit-event activity (edit-event is Phase 6f); invitation and team-formation actions; logging server-side
cascades individually; localizing beyond English (the `event` namespace is English-only).

## Conventions followed

Additive migration `0070`; RPC `security definer set search_path = public` + `grant execute … to
authenticated`; SQL test `PT001`/`OK`; hand-edited `database.types.ts`; thin `@padel/api` hooks + `qk`
key; `useT('event')`; FlashList; reuse `is_event_organizer`/`event_is_visible`.
