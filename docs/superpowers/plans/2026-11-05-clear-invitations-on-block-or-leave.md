# Clear invitations when someone is blocked or leaves a group

Task: PAD-151, found in PAD-99. Approved by the CTO. Builder: Engineer A. Backend only, no client change.

## The problem

0146 and 0147 stop out-of-scope players from being invited. Nothing clears an invitation they already hold:

- `event_is_visible` (0100) and `is_event_invitee` (0044) accept an invitation row of **any** status, on any date. A declined invitation still shows a private event.
- `join_event` (0121) and `accept_event_invitation` (0122) don't check blocks. `join_event` only asks `is_event_invitee`, so someone blocked, or who has left the group, can still join a private event with a leftover row, even a declined one.

Hosted today (PAD-103, 2026-11-05): 243 invitations checked, 3 out of scope, all on old events and all blocked.

## Decisions

### 1. Triggers, not each function

Add an `AFTER DELETE` trigger on `group_members` and an `AFTER INSERT` trigger on `blocks`.

- `group_members` rows are deleted by `leave_group`, `remove_group_member`, `remove_member`, `leave_community` and account deletion, and the service role can delete them too. `remove_member` and `leave_community` delete the group rows first, so this one trigger covers the community paths as well. Events belong to a group, so nothing is needed on `community_members`.
- `block_user` is the only client path to `blocks`, but the service role can insert directly (0140 lists that gap for follows). A trigger closes it for invitations.
- No RPC body changes for this, so nothing can drift from the bodies in 0098 and 0107. `join_event` and `accept_event_invitation` need no new block check: once the row is gone they answer `not_invited` and `invitation_not_found`.

### 2. What gets cleared

One internal helper, `_clear_event_invitation(p_event_id uuid, p_user uuid)`, does the following:

- **Deletes the invitation row, whatever its status, on any event date.** Visibility ignores status and date, so anything less leaves the access in place. It also matches the PAD-99 count, which counts every status.
- **Settles the open notification,** as `organizer_revoke_invitation` does (0127): `cta_done = true, read_at = coalesce(read_at, now())` where `type = 'event_invite' and not cta_done`. Settled, not deleted: it happened.
- **Removes an `'invited'` roster row** (from `organizer_remove_from_team` or a switch). It is the same state as a pending invitation, and `event_is_visible` also accepts any roster row. It also runs `organizer_remove_participant`'s two `partner_requests` lines (delete the player's pending requests, decline those aimed at them). Teammate state doesn't change: a team holding an `'invited'` player isn't confirmed.

It leaves these alone:

- **`interested`, `confirmed` and `waiting_list` rows.** A place someone holds isn't an invitation. Removing it would need capacity, waitlist and team handling, and it's a product decision. Their deleted invitation row isn't needed: the roster RPCs all accept `is_event_invitee or is_event_participant`.
- **Contact-only invitations** (`invitee_id is null`).

**It is silent.** No notification and no `_log_activity` call: the other person must not learn about a block. One side effect is accepted: `_activity_on_participant` logs `left` if the person whose `'invited'` row is removed made the call themselves. It already hides the name for a blocked pair.

**Nothing is restored.** Unblocking or rejoining doesn't bring an invitation back; the organizer invites again. This also applies to later series occurrences, because `_materialize_next` copies from the previous one.

### 3. Which events each trigger clears

- **Leaving a group:** every event with `group_id = old.group_id`, private or public, that has an invitation or `'invited'` row for `old.user_id`. Same guard as `track_group_departure` (0108): skip when the group or profile row is already gone, because that's a cascade and not a departure.
- **A block between A and B:** for each direction, events where the first person holds the invitation and the second is the **organizer or the `invited_by`**, plus events where the first has an `'invited'` row and the second is the organizer.

### 4. Blocks with an inviter who isn't the organizer: yes, clear them

The PAD-99 count and 0147's series filter both treat a block with `invited_by` as out of scope, so anything else leaves the count above zero and drops the invitation at the next occurrence anyway. I found no current path that writes an inviter other than the organizer (`invite_to_event` and `create_event` require the organizer, and both scheduler calls pass `organizer_id`), so this only affects older rows. An organizer who still wants that player can invite them directly.

### 5. Close the two paths that write the invitation back

The task didn't list these. Without them the count rises again:

- `_reset_invitation_after_leave` (0112), `p_create = true` branch: when a partner is dropped with a leaver, it **inserts** a fresh pending invitation, which also sends `event_invite`.
- `organizer_remove_participant` (0127), `to_invited` branch: same insert.

Add an internal `_invitee_in_scope(p_event_id, p_user)`: not `notif_blocked` with the organizer, and a member when the event has a group. Guard **only those two inserts**. When it's false, the row isn't written, so `to_invited` acts like `from_event` and no new error reaches the client. Change nothing else in those bodies, and mark the new lines `NEW (0149)`. Their update branches need no guard, because the trigger has already removed the row. Leave the public-event branch of `_reset_invitation_after_leave` alone: 0112 deliberately keeps an explicit invitation to an outsider there.

## Migration

`infra/supabase/migrations/0149_clear_invitations_on_block_or_leave.sql` (confirm the next free number when you branch; 0148 is the latest on `main` today).

- Every new function: `security definer set search_path = public`, and `revoke execute ... from public, anon, authenticated`. Keep the existing grants on the two redefined functions.
- End with a self-check `do $$` block, as in 0127: both triggers exist, no new function is executable by `anon` or `authenticated`, and both redefined bodies contain `_invitee_in_scope`.
- **No one-off delete and no helper call at the top level of this file.** The 3 hosted rows stay with PAD-99, as its own step through the founder. A `delete from` outside a function body makes the `Supabase migrations` workflow hold the file. The scan skips function bodies, so a defined helper called in the same file would run a data change it doesn't flag. Don't do that.
- Don't redefine `block_user`, `leave_group`, `remove_group_member`, `remove_member`, `leave_community`, `join_event` or `accept_event_invitation`.

## Tests

New file: `infra/supabase/tests/clear-invitations-on-block-or-leave.test.mjs`, using the helpers in `create-event-invitee-scope.test.mjs`. Each case asserts through the RPC, not a direct write.

Group leaving, private group event, invited player:
1. `leave_group`, `remove_group_member`, `remove_member` and `leave_community` each remove the row. Afterwards the player can't see the event (`event_is_visible` false), and `join_event` answers `not_invited`.
2. Pending, declined and accepted-without-roster rows all go. A past event's row goes too.
3. A confirmed player who leaves the group keeps their place, and can still use the event's roster RPCs.

Blocks:
4. `block_user` in **both** directions, invitee with organizer: row gone, event not visible, `accept_event_invitation` answers `invitation_not_found`.
5. Block with an `invited_by` who isn't the organizer (fixture written with the service role): row gone.
6. Block with an unrelated user, or with another invitee of the same event: row stays.
7. Service-role insert into `blocks` clears too. A repeat `block_user` (`on conflict do nothing`) raises nothing.

Settling and silence:
8. The `event_invite` notification is `cta_done` and read, and not deleted. Other notification types for that event are untouched.
9. Neither side gets a new notification. No `removed` or `invited` activity entry.

`'invited'` roster rows:
10. The row is removed with the invitation; the teammate is unchanged; the player's pending partner requests are settled.

Rewrite paths:
11. Blocked or out-of-group partner dropped with a leaver: no invitation created, no `event_invite`. An in-scope partner still gets one (0112's behaviour).
12. `organizer_remove_participant(..., 'to_invited')` on a blocked or out-of-group player: no invitation, roster row gone, no error. In scope: unchanged.

Series and regressions:
13. After a clear, `_materialize_next` doesn't invite the player to the next occurrence.
14. Contact-only invitations survive both triggers.
15. Account deletion still passes with the trigger firing. Group or profile cascades don't raise.

Also check that the new functions are in the expected lists of any existing grant test (`0136`, `0142` patterns).

## Hand-off and hosted

- Checks: `pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions && pnpm test:db`. Regenerate `packages/db/src/database.types.ts` if the repo's check expects it.
- No new user-facing string, no RPC signature change, no edge function, no mobile build.
- Hosted: the `Supabase migrations` workflow applies it on merge. No founder SQL. `Migration check` must list only this file and must not warn as destructive. This is one of the first real migrations through that path, so the CTO reads its logs.
- Order with PAD-99: merge this, then run PAD-99's one-off delete if the founder approves it. The count then stays at zero.

## Out of scope, for later

- A blocked pair who both hold committed places on a roster still see each other's event. That's the behaviour today and a product call, not a leftover invitation.
- `is_event_invitee` accepting a declined row (a player who declined can still `join_event` a private event). It may be deliberate; it isn't caused by a block or a departure, so don't change it here.
