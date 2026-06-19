# Activity-Log Coverage + Server-Side Move (A3) — Design

*Padel Jam • 2026-06-19 • Brainstormed design / spec*

## Goal

Make the event activity log **complete** and **bypass-proof**: log edit-event, invitation-sent, and
invitation accept/decline actions; and move the organizer roster + team actions out of client-fired
`logActivity` calls into their RPCs. Only low-risk self actions (join/leave) stay client-fired. Closes the
5G-2 deferred items "edit-event activity; invitation and team-formation actions; logging server-side."

## Scope decisions (from the brainstorm)

1. **Server-side scope:** the 4 gap actions (edit / invite / accept / decline) are logged inline in their RPCs;
   the organizer roster + team RPCs are recreated to log inline (and their client `logActivity` calls removed).
   `join`/`leave` remain client-fired via the existing `log_event_activity` RPC.
2. **Edit granularity:** one `'event_edited'` entry per save, with `detail.changes` = the list of changed
   groups (`date`, `location`, `scoring`, `preferences`, `details`); logged only when ≥1 group changed.
3. **Invitations:** log all three — `'invited'` (organizer; one row per invitee), `'invite_accepted'` and
   `'invite_declined'` (actor = the invitee).

### Why accept/decline must be server-side

`log_event_activity` only authorizes `'joined'`/`'left'` as *self* actions; every other action requires the
caller to be the organizer. An invitee accepting/declining is neither the organizer nor performing a
self-join action, so their client **cannot** write an `invite_accepted`/`invite_declined` row via the RPC.
Inline logging inside `accept_event_invitation`/`decline_event_invitation` (SECURITY DEFINER) is the only
correct path.

### Explicitly deferred

- Localizing the new copy beyond English (A5).
- Splitting an edit into per-field-group rows (we use a single entry with a `changes` array).

## Verified context

- **`event_activity`** ([0070_event_activity.sql](../../../infra/supabase/migrations/0070_event_activity.sql)):
  `id, event_id, actor_id, action text, detail jsonb default '{}', created_at`. RLS: organizer-only **read**;
  no insert/update/delete policy (writes only via SECURITY DEFINER code). Index `(event_id, created_at desc)`.
- **`log_event_activity(p_event_id, p_action, p_detail)`** (0070, whitelist extended in
  [0071_organizer_team_rpcs.sql](../../../infra/supabase/migrations/0071_organizer_team_rpcs.sql)): actor =
  `auth.uid()`; whitelists actions; authorizes organizer-only actions vs `joined`/`left` self actions.
  **Unchanged by A3** — keeps serving client-fired join/leave.
- **Client `logActivity` helper + call sites**
  ([packages/api/src/events/mutations.ts](../../../packages/api/src/events/mutations.ts)): best-effort wrapper
  (swallows errors). Call sites today: `useJoinEvent`('joined'), `useLeaveEvent`('left'),
  `useMarkConfirmed`('confirmed'), `useRemoveParticipant`('removed'), `useAddManualParticipant`('guest_added'),
  `useMarkPaid`('marked_paid'/'marked_unpaid'), `useMarkAllPaid`('marked_all_paid'),
  `useAssignToTeam`('team_assigned'), `useRemoveFromTeam`('team_removed'), `useSwitchPlayers`('team_switched').
  Each passes a client-supplied `detail` (e.g. `target_name`) and invalidates `qk.eventActivity`.
- **RPCs to recreate** (current definitions live in these migrations — copy verbatim, append the insert):
  - `update_event` — [0080_update_event_location.sql](../../../infra/supabase/migrations/0080_update_event_location.sql)
    (the latest definition; already computes a location-change check). No activity logging today.
  - `invite_to_event`, `accept_event_invitation`, `decline_event_invitation` —
    [0047_roster_rpcs.sql](../../../infra/supabase/migrations/0047_roster_rpcs.sql). No logging today.
  - `organizer_mark_confirmed`, `organizer_remove_participant`, `add_manual_participant`, `mark_paid`,
    `mark_all_paid` — [0047_roster_rpcs.sql](../../../infra/supabase/migrations/0047_roster_rpcs.sql) (verify
    exact names/signatures; some may live in adjacent roster migrations). Logged client-side today.
  - `organizer_assign_to_team`, `organizer_remove_from_team`, `organizer_switch_players` —
    [0071_organizer_team_rpcs.sql](../../../infra/supabase/migrations/0071_organizer_team_rpcs.sql). Logged
    client-side today.
- **Screen** ([apps/mobile/app/event/[id]/activity.tsx](../../../apps/mobile/app/event/[id]/activity.tsx)):
  `lineFor(t,row)` maps `row.action` → an i18n key, interpolating `{{actor}}` (from `profiles.full_name`) and
  `{{target}}` (from `detail.target_name`/`guest_name`). English copy in
  [apps/mobile/lib/i18n-mobile.ts](../../../apps/mobile/lib/i18n-mobile.ts) (`activity*` keys).
- **Inline-insert pattern reference:** `cancel_event`
  ([0073_cancel_event.sql](../../../infra/supabase/migrations/0073_cancel_event.sql)) inserts notifications
  inside the RPC after the main action; A3 mirrors this for `event_activity`.
- Highest migration is **`0080`**; this slice uses **`0081`**.

## Architecture

### 1. Migration `0081_activity_logging.sql`

`create or replace` each affected RPC, preserving its current body verbatim and appending an inline insert.
The generic shape (actor is always server-verified `auth.uid()`):
```sql
insert into event_activity (event_id, actor_id, action, detail)
values (p_event_id, auth.uid(), '<action>', <detail jsonb>);
```

- **`update_event`** — after the `update events …`, compute changed groups and log only if non-empty:
  ```sql
  -- groups: 'date' (starts_at/duration), 'location' (venue/manual fields), 'scoring' (mode/value),
  -- 'preferences' (standby/privacy/fees/players_submit/organizer_role), 'details' (name/description/thumbnail)
  -- build text[] v_changes by comparing v_ev (old) vs the payload; reuse the existing v_loc_changed.
  if array_length(v_changes,1) is not null then
    insert into event_activity (event_id, actor_id, action, detail)
    values (p_event_id, v_user, 'event_edited', jsonb_build_object('changes', to_jsonb(v_changes)));
  end if;
  ```
- **`invite_to_event`** — one row per invitee (derive the display name from the invitee payload / profile):
  ```sql
  insert into event_activity (event_id, actor_id, action, detail)
  select p_event_id, auth.uid(), 'invited',
         jsonb_build_object('target_name', coalesce(<invitee_name>, <profile full_name>))
  from <invitees source>;
  ```
- **`accept_event_invitation`** / **`decline_event_invitation`** — single insert of
  `'invite_accepted'` / `'invite_declined'` (no target; actor is the invitee).
- **Roster RPCs** (`organizer_mark_confirmed` → `'confirmed'`, `organizer_remove_participant` → `'removed'`
  with `detail.mode`, `add_manual_participant` → `'guest_added'` with `guest_name`, `mark_paid` →
  `'marked_paid'`/`'marked_unpaid'`, `mark_all_paid` → `'marked_all_paid'`) — append the insert, deriving
  `target_name` from the participant row (`profiles.full_name` or `event_participants.guest_name`) rather than
  a client argument.
- **Team RPCs** (`organizer_assign_to_team` → `'team_assigned'` with `team_number`, `organizer_remove_from_team`
  → `'team_removed'`, `organizer_switch_players` → `'team_switched'`) — append the insert, server-deriving the
  target name(s).

`log_event_activity` is **not** modified.

### 2. `@padel/api`

- Remove the `logActivity(...)` calls from the 8 migrated hooks (`useMarkConfirmed`, `useRemoveParticipant`,
  `useAddManualParticipant`, `useMarkPaid`, `useMarkAllPaid`, `useAssignToTeam`, `useRemoveFromTeam`,
  `useSwitchPlayers`). Keep the `logActivity` helper (still used by `useJoinEvent`/`useLeaveEvent`).
- Add `qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) })` to the `onSuccess` of `useUpdateEvent`,
  `useInviteToEvent`, and the accept/decline invitation hooks (so the log refreshes after those actions).
  (The migrated organizer/team hooks already invalidate `qk.eventActivity`.)

### 3. Mobile — `activity.tsx` + i18n

- Extend `lineFor`'s key map with: `event_edited → activityEventEdited`, `invited → activityInvited`,
  `invite_accepted → activityInviteAccepted`, `invite_declined → activityInviteDeclined`.
- For `event_edited`, append the changed groups in parentheses: build from `detail.changes` (array of group
  keys) mapped to English words via a small local dict, e.g. `'{{actor}} edited the event (date, location)'`.
  When `changes` is absent/empty, render just `'{{actor}} edited the event'`.
- English i18n keys (PT/PT-BR deferred to A5):
  `activityEventEdited: '{{actor}} edited the event'`, `activityInvited: '{{actor}} invited {{target}}'`,
  `activityInviteAccepted: '{{actor}} accepted their invitation'`,
  `activityInviteDeclined: '{{actor}} declined their invitation'`, plus the changed-group words
  (`date`/`location`/`scoring`/`preferences`/`details`).

## Error handling

- Inline inserts run inside the RPC transaction: if the main action commits, its log row commits atomically —
  this is exactly the bypass-proofing we want (no best-effort swallow). A failed insert would roll back the
  whole action, but the inserts are simple and constraint-safe (`event_activity` has no CHECK on `action`).
- Removing client `logActivity` for migrated actions means a transient client can't double-log; the server is
  the single source.

## Testing / verification

- **DB:** `db reset` clean; new `infra/supabase/tests/activity_logging.sql` → `OK activity_logging`:
  - `update_event` with a date+scoring change writes one `event_edited` row whose `detail->'changes'` contains
    `date` and `scoring`; a no-op-relevant edit (only fields not in any tracked group, if any) writes none.
  - `invite_to_event` with 2 invitees writes 2 `invited` rows.
  - `accept_event_invitation` / `decline_event_invitation` each write one row with the invitee as `actor_id`.
  - `organizer_mark_confirmed` (representative migrated action) writes exactly one `confirmed` row from the RPC
    (server-side), with a server-derived `target_name`.
  - Re-run the existing roster/team SQL tests (e.g. `infra/supabase/tests/*roster*`, `*team*`) → still `OK`
    (no behavioral regression from the recreations).
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`.
- **App smoke (simulator):** as organizer, edit an event / invite someone / confirm a player → each appears in
  the Activity log with correct copy; an invitee accepting/declining shows in the organizer's log.

## Conventions followed

Additive migration `0081` recreating RPCs with inline `event_activity` inserts (the `cancel_event` pattern);
actor always `auth.uid()`; target names server-derived; SQL test `PT001`/`OK`; thin `@padel/api` changes
(remove duplicate client logging, add cache invalidation); `useT('event')`; English-only new copy (PT/PT-BR →
A5). `log_event_activity` and the join/leave client path are left intact.
