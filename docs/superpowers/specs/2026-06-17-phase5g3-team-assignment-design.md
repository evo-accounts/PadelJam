# Phase 5G-3 — Team Assignment ("Manage players (team)") — Design

*Padel Jam • 2026-06-17 • Brainstormed design / spec*

## Goal

Give organizers a Team view + Player view for **team-spec events** on the Manage screen: tap-to-assign
players into a fixed `num_courts×2` team grid, auto-confirm on pairing, switch two players' positions, and
remove a player from a team. Closes **JM-29, JM-30, JM-31, JM-32** (all *Must*).

Third slice of Phase 5G (Manage-Event). Builds on 5G-2's `log_event_activity`.

## Scope decisions (from the 5G-3 brainstorm)

1. **Tap-to-assign** (no drag-drop; `@dnd-kit` is web-only and unusable in React Native).
2. **Fixed grid:** `num_courts×2` team blocks (2 teams per court), each with slots A/B. The grid inherently
   caps confirmed players at `num_courts*4`, so no separate capacity check.
3. **Switch-player (JM-32) is included** in this slice.
4. **Pairing / auto-confirm semantics (approved):** a player occupying a slot in an incomplete (1-player)
   team stays `invited` (unpaired); completing the pair (both slots filled) sets the team
   `is_confirmed = true` and confirms **both** players. The JM-30 confirm modal warns the organizer that
   assigning an unconfirmed player will confirm them once the team is complete.

## Verified context

- `event_teams` ([0041_events_roster.sql:36](../../../infra/supabase/migrations/0041_events_roster.sql#L36)):
  `id, event_id, team_number int, player_a_id/player_b_id (fk→event_participants on delete set null),
  team_name, is_confirmed bool`; `unique(event_id, team_number)`; check `player_a_id is null or
  player_a_id <> player_b_id`. RLS: read `event_is_visible`, write `is_event_organizer`, **but no direct
  DML grant to authenticated** ([0051](../../../infra/supabase/migrations/0051_security_hardening.sql)) —
  writes go through SECURITY DEFINER RPCs.
- Player-driven team creation already exists (`choose_partner`, `request_partner`/`accept_partner_request`
  in [0047_roster_rpcs.sql](../../../infra/supabase/migrations/0047_roster_rpcs.sql)); each assigns
  `team_number := max+1` and sets `is_confirmed=true` for a full pair. `leave_event` breaks a team pair by
  demoting the partner to `invited` and clearing the team row. **No organizer-driven team RPCs exist.**
- `useEventTeams` ([packages/api/src/events/queries.ts](../../../packages/api/src/events/queries.ts)):
  flat `select('*')`, no participant/profile embeds.
- `manage.tsx` ([apps/mobile/app/event/[id]/manage.tsx](../../../apps/mobile/app/event/[id]/manage.tsx)):
  organizer-gated rotation roster (Confirmed/Invited/Waiting/Standby); only branches on `specification`
  for the Mixed gender field; **no team UI**, no `specification==='team'` branch.
- Helpers `is_event_organizer(event_id, uuid)`, `event_is_visible(event_id, uuid)` exist.
- `log_event_activity` (5G-2, [0070](../../../infra/supabase/migrations/0070_event_activity.sql)) has a
  fixed action allow-list; the best-effort `logActivity` helper lives in
  [mutations.ts](../../../packages/api/src/events/mutations.ts).
- Highest migration is `0070`; this slice uses **`0071`**.

## Architecture

### Migration `0071_organizer_team_rpcs.sql`

All `language plpgsql security definer set search_path = public`; each begins with organizer +
team-event validation:
```
if not is_event_organizer(p_event_id, auth.uid()) then raise exception 'forbidden' using errcode='P0001'; end if;
-- and the event must be specification='team'
```

**`organizer_assign_to_team(p_event_id uuid, p_participant_id uuid, p_team_number int, p_slot text)`**
- Validate `p_slot in ('a','b')`; `p_team_number between 1 and (num_courts*2)`; participant belongs to the event.
- Advisory lock on `'event_roster:'||p_event_id`.
- **Move semantics:** clear `p_participant_id` from any slot it currently occupies in this event
  (set that slot null; recompute that team's `is_confirmed`; if that vacated a complete team, demote the
  now-lone partner to `invited`).
- Upsert the `event_teams` row for `(event_id, team_number)` (insert if missing with the other slot null),
  set the chosen slot = `p_participant_id`.
- Recompute target team: `v_full := (player_a_id is not null and player_b_id is not null)`;
  `is_confirmed = v_full`. If `v_full` → set BOTH slot participants `status='confirmed', confirmed_at=now(),
  waiting_list_position=null, is_standby=false`. Else (lone) → leave the assigned participant's status as
  `invited` (set it to `invited` if currently `interested`/`waiting_list`, clearing waiting position).

**`organizer_remove_from_team(p_event_id uuid, p_participant_id uuid)`**
- Find the participant's slot. Clear it. Mirror `leave_event`: if the team had a partner, demote the
  partner to `invited` and clear their slot too (team emptied); the removed player → `invited`.
  `is_confirmed=false`. (Removal here is "remove from team", NOT from the event — the participant rows stay.)

**`organizer_switch_players(p_event_id uuid, p_participant_a uuid, p_participant_b uuid)`**
- Look up each participant's current "position": either `(team_number, slot)` or none (list player:
  invited/interested/waiting). Swap occupancy — write A into B's slot reference and B into A's (updating the
  `event_teams` slot columns). For any list-only participant, "position" is the absence of a slot.
  After the swap, for each of the (≤2) affected teams recompute `is_confirmed`; reconcile statuses: a
  participant now in a complete team → `confirmed`; a participant no longer in any slot (or in a lone team)
  → `invited`. No-op if either participant is missing or they're identical.

Grant execute on the three functions to authenticated.

**Extend `log_event_activity` allow-list** (in this migration, `create or replace function`): add
`'team_assigned'`, `'team_switched'`, `'team_removed'` to the organizer-action array so team changes appear
in the 5G-2 activity log.

**SQL test `organizer_team.sql`** (`PT001`/`OK`): seed a team event with `num_courts=1` (→ 2 teams) and 3
participants. Assert: assigning one player → team `is_confirmed=false`, player stays `invited`; assigning a
2nd to the same team → `is_confirmed=true`, both `confirmed`; `organizer_remove_from_team` on one → both
back to `invited`, team emptied; `organizer_switch_players` swaps a team player with an invited player
(entering player confirmed when team complete, displaced player invited); a non-organizer caller →
`forbidden`.

### `database.types.ts`

Hand-add the three RPCs (`Args` + `Returns: undefined`) to the `Functions` block. The `event_teams` Row
type already exists and is unchanged; the new team-action strings are plain `text` RPC args, not enums, so
they need no type additions.

### `@padel/api`

- **Enrich `useEventTeams(id)`**: embed both slots —
  `select('*, player_a:event_participants!player_a_id (id, user_id, guest_name, status, profiles(full_name, avatar_url)), player_b:event_participants!player_b_id (id, user_id, guest_name, status, profiles(full_name, avatar_url))')`,
  ordered by `team_number`. Define a `TeamRow` type with `player_a`/`player_b` (each `{ id, user_id,
  guest_name, status, profiles } | null`). Verify the PostgREST FK-hint embed resolves against the two FKs.
- **New mutations** (mutations.ts), each `(eventId)`-scoped, invalidating `qk.eventTeams(eventId)`,
  `qk.eventParticipants(eventId)`, `qk.eventActivity(eventId)`, and firing best-effort `logActivity`:
  - `useAssignToTeam(eventId)` → `organizer_assign_to_team`; input `{ participantId, teamNumber, slot:'a'|'b', targetName? }`; logs `team_assigned` `{ target_name, team_number }`.
  - `useRemoveFromTeam(eventId)` → `organizer_remove_from_team`; input `{ participantId, targetName? }`; logs `team_removed` `{ target_name }`.
  - `useSwitchPlayers(eventId)` → `organizer_switch_players`; input `{ participantA, participantB }`; logs `team_switched`.

### Mobile

- **`manage.tsx`**: when `event.specification === 'team'`, render `<TeamManage event={event}
  participants={participants} />` instead of the rotation sections; otherwise the existing roster unchanged.
- **New `apps/mobile/components/event/TeamManage.tsx`**: a Team/Player segmented toggle.
  - **Team view:** a fixed grid of `num_courts*2` blocks (Team 1..N), each two slots. Map each
    `team_number` to its `useEventTeams` row (may be absent → empty block). Empty slot → tap → **assign
    sheet** listing assignable participants (status `invited`/`interested`/`waiting_list`, plus `confirmed`
    not currently in any team slot). Tap a participant → if their `status !== 'confirmed'`, show the
    **confirm modal** (JM-30 copy) → `useAssignToTeam`. Filled slot → tap → action sheet: **Switch player**
    (→ switch sheet listing all other participants → `useSwitchPlayers`) or **Remove from team**
    (`useRemoveFromTeam`). Show an "unpaired" hint on 1-player teams.
  - **Player view:** tabs **Confirmed (count/`num_courts*4`) · Interested (n) · Invited (n)** over the same
    participants; each row offers **Remove** (→ existing `useRemoveParticipant` `from_event`); a note points
    to Team view for pairing/confirmation (confirmation requires a complete team).
- **i18n** (`event` namespace, English-only `mobileEvent.en`): `teamViewTab`, `playerViewTab`, `teamSlotEmpty`,
  `teamUnpaired`, `assignTitle`, `assignConfirmTitle`, `assignConfirmBody` ("{{name}} isn't confirmed.
  Adding them to a team will confirm them once the team is complete. Continue?"), `switchTitle`,
  `removeFromTeamCta`, `switchPlayerCta`, `interestedTab`, plus activity lines `activityTeamAssigned`
  ("{{actor}} assigned {{target}}"), `activityTeamSwitched` ("{{actor}} switched players"),
  `activityTeamRemoved` ("{{actor}} removed {{target}} from a team"). Add the new actions to `activity.tsx`'s
  `lineFor` key map.

## Error handling

- All three RPCs raise `forbidden` for non-organizers / non-team events (`P0001`), surfaced via the existing
  `mapPgError`/`{error}` paths. Mutations keep the standard `throw new Error(mapPgError(...))`.
- Activity logging is best-effort (swallowed), as in 5G-2.
- Assign sheet only lists eligible participants; the grid bounds team numbers, so capacity can't be exceeded.

## Testing

- **DB:** `db reset` clean; `organizer_team.sql` prints `OK organizer_team` (assign/pair/remove/switch +
  forbidden).
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`.
- **App smoke (simulator):** on a team event as organizer — assign one player (team unpaired, player
  invited), assign a second (both confirmed, team confirmed), switch a team player with an invited player,
  remove from team (partner demoted); confirm entries appear in the Activity log.

## Explicitly out of scope

Drag-and-drop; team renaming (`team_name`); auto-balancing / suggested pairings; standby handling within
teams; rotation (non-team) events; player-facing changes (the existing partner-request flow is unchanged).

## Conventions followed

Additive migration `0071`; RPCs `security definer set search_path = public` + grants; advisory lock
`'event_roster:'||event_id` (matching the roster RPCs); SQL test `PT001`/`OK`; hand-edited
`database.types.ts`; thin `@padel/api` hooks + `qk`; best-effort `logActivity` (5G-2); `useT('event')`;
reuse `is_event_organizer`/`event_is_visible` and the `leave_event` pair-demotion semantics.
