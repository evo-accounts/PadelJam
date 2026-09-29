// infra/supabase/tests/revoke-invitation.test.mjs
//
// Migration 0127 (UX Audit — Manage Event, plan PR "M3 — mobile team management"), through
// PostgREST as the signed-in organizer or player:
//   R1 organizer_revoke_invitation   R2 organizer_switch_with_invitee
//   R3 organizer_assign_to_team: slot_taken, the stand-by team bound, capacity
//   R4 organizer_remove_participant reconciles the removed player's team
// plus MEVT-14: "Remove" on an Interested player sends them back to Invited.
// Fixtures no RPC sets (a roster row next to a pending invitation) use the service role.
import { user, rpc, sel, insert, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);

const payload = (over) => ({
  group_id: null, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Revoke ${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: true, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
/** A private group-less event inviting `list`. */
const privateEvent = (org, list = [], over = {}) =>
  rpc(org.jwt, 'create_event', { p_payload: payload({ invitees: list.map((u) => ({ invitee_id: u.id })), ...over }) });
const teamEvent = (org, list, over = {}) => privateEvent(org, list, { specification: 'team', ...over });

const part = (ev, u) => sel('event_participants', `event_id=eq.${ev}&user_id=eq.${u.id}&select=id,status`).then((r) => r[0]);
const invOf = (ev, u) => sel('event_invitations', `event_id=eq.${ev}&invitee_id=eq.${u.id}&select=id,status`).then((r) => r[0]);
const team = (ev, n) => sel('event_teams', `event_id=eq.${ev}&team_number=eq.${n}&select=player_a_id,player_b_id,is_confirmed`).then((r) => r[0]);
const activity = (ev, action) => sel('event_activity', `event_id=eq.${ev}&action=eq.${action}&select=detail&order=created_at`);
const notifs = (u, type, ev) => sel('notifications', `user_id=eq.${u.id}&type=eq.${type}&event_id=eq.${ev}&select=id,cta_done`);
const invited = (org, ev) => rpc(org.jwt, 'event_invited_players', { p_event_id: ev });
/** An invitee who says "let others invite me": status interested, no team. */
const interested = async (ev, u) => {
  await rpc(u.jwt, 'request_partner', { p_event_id: ev, p_targets: [] });
  return (await part(ev, u)).id;
};
const assign = (org, ev, pid, n, slot) =>
  rpc(org.jwt, 'organizer_assign_to_team', { p_event_id: ev, p_participant_id: pid, p_team_number: n, p_slot: slot });

// ---------------------------------------------------------------------------------------------
// R1
// ---------------------------------------------------------------------------------------------
await run('R1: the organizer revokes a pending invitation with no roster row', async () => {
  const org = await user('r1-org');
  const a = await user('r1-a', { name: 'Revoked Rita' });
  const b = await user('r1-b');
  const ev = await privateEvent(org, [a, b]);
  const row = (await invited(org, ev)).find((r) => r.user_id === a.id);
  assert(row, 'a is listed as invited');
  assert((await notifs(a, 'event_invite', ev)).length === 1, 'a was sent an event_invite');

  await expectError(() => rpc(b.jwt, 'organizer_revoke_invitation', { p_event_id: ev, p_invitation_id: row.invitation_id }), 'forbidden');
  await rpc(org.jwt, 'organizer_revoke_invitation', { p_event_id: ev, p_invitation_id: row.invitation_id });

  assert((await invOf(ev, a)) === undefined, 'the invitation is gone');
  assert(!(await invited(org, ev)).some((r) => r.user_id === a.id), 'no longer on the Invited list');
  assert((await invOf(ev, b))?.status === 'pending', 'the other invitation is untouched');
  const [n] = await notifs(a, 'event_invite', ev);
  assert(n.cta_done, 'the invite notification is settled (no Join CTA)');
  assert((await notifs(a, 'removed_from_event', ev)).length === 0, 'nobody is notified');
  const log = await activity(ev, 'removed');
  assert(log.length === 1 && log[0].detail.mode === 'invitation' && log[0].detail.target_name === 'Revoked Rita',
    `logged as removed/invitation, got ${JSON.stringify(log)}`);

  await expectError(() => rpc(org.jwt, 'organizer_revoke_invitation', { p_event_id: ev, p_invitation_id: row.invitation_id }), 'invitation_not_found');
  // An invitation of another event is not this event's.
  const other = await privateEvent(org, [b]);
  const bInv = await invOf(ev, b);
  await expectError(() => rpc(org.jwt, 'organizer_revoke_invitation', { p_event_id: other, p_invitation_id: bInv.id }), 'invitation_not_found');
});

await run('R1: an invitee with a roster row, an answered invitation, a closed event are refused', async () => {
  const org = await user('r1b-org');
  const a = await user('r1b-a');
  const b = await user('r1b-b');
  const c = await user('r1b-c');
  const ev = await privateEvent(org, [a, b, c]);
  // Accepted: the invitation is no longer pending.
  await rpc(a.jwt, 'accept_event_invitation', { p_event_id: ev });
  const aInv = await invOf(ev, a);
  await expectError(() => rpc(org.jwt, 'organizer_revoke_invitation', { p_event_id: ev, p_invitation_id: aInv.id }), 'invitation_not_found');
  // A roster row next to a still-pending invitation is organizer_remove_participant's.
  await insert('event_participants', { event_id: ev, user_id: b.id, status: 'invited', invited_by: org.id });
  const bInv = await invOf(ev, b);
  await expectError(() => rpc(org.jwt, 'organizer_revoke_invitation', { p_event_id: ev, p_invitation_id: bInv.id }), 'invitee_in_roster');
  // After the event closes the lists are read-only.
  await rpc(org.jwt, 'cancel_event', { p_event_id: ev, p_scope: 'only_this' });
  const cInv = await invOf(ev, c);
  await expectError(() => rpc(org.jwt, 'organizer_revoke_invitation', { p_event_id: ev, p_invitation_id: cInv.id }), 'event_not_editable');
});

// ---------------------------------------------------------------------------------------------
// R2
// ---------------------------------------------------------------------------------------------
await run('R2: switching a team player with an invitee — invitee confirmed in the slot, leaver back to Invited', async () => {
  const org = await user('r2-org');
  const [a, b, c, d] = [await user('r2-a'), await user('r2-b'), await user('r2-c'), await user('r2-d')];
  const ev = await teamEvent(org, [a, b, c, d]);
  const pa = await interested(ev, a);
  const pb = await interested(ev, b);
  await assign(org, ev, pa, 1, 'a');
  await assign(org, ev, pb, 1, 'b');
  assert((await team(ev, 1)).is_confirmed, 'team 1 complete');

  // c: a pending invitation only, no roster row.
  const pc = await rpc(org.jwt, 'organizer_switch_with_invitee', { p_event_id: ev, p_participant_id: pa, p_user_id: c.id });
  const t1 = await team(ev, 1);
  assert(t1.player_a_id === pc && t1.player_b_id === pb && t1.is_confirmed, `c takes a's slot, got ${JSON.stringify(t1)}`);
  assert((await part(ev, c)).status === 'confirmed', 'c is confirmed');
  assert((await invOf(ev, c)).status === 'accepted', "c's invitation is accepted");
  assert((await part(ev, a)).status === 'invited', 'a is back to Invited');
  assert((await notifs(c, 'organizer_confirmed', ev)).length === 1, 'c is told');

  // Not in a team; nobody invited under that user; a player of another event.
  await expectError(() => rpc(org.jwt, 'organizer_switch_with_invitee', { p_event_id: ev, p_participant_id: pa, p_user_id: d.id }), 'not_in_team');
  const stranger = await user('r2-x');
  await expectError(() => rpc(org.jwt, 'organizer_switch_with_invitee', { p_event_id: ev, p_participant_id: pb, p_user_id: stranger.id }), 'invitation_not_found');
  await expectError(() => rpc(d.jwt, 'organizer_switch_with_invitee', { p_event_id: ev, p_participant_id: pb, p_user_id: d.id }), 'forbidden');

  // d has a roster row (interested): same path, no second row.
  const pd = await interested(ev, d);
  const back = await rpc(org.jwt, 'organizer_switch_with_invitee', { p_event_id: ev, p_participant_id: pb, p_user_id: d.id });
  assert(back === pd, 'the existing row is used');
  assert((await part(ev, d)).status === 'confirmed' && (await part(ev, b)).status === 'invited', 'd in, b out');
  assert((await activity(ev, 'team_switched')).length === 2, 'two switches logged');
});

// ---------------------------------------------------------------------------------------------
// R3
// ---------------------------------------------------------------------------------------------
await run('R3: assign refuses a taken slot and follows the stand-by team bound', async () => {
  const org = await user('r3-org');
  const [a, b, c] = [await user('r3-a'), await user('r3-b'), await user('r3-c')];
  // 1 court + 2 stand-by spots: capacity 6 → three teams.
  const ev = await teamEvent(org, [a, b, c], { allow_standby: true, standby_spots: 2 });
  const pa = await interested(ev, a);
  const pb = await interested(ev, b);
  await assign(org, ev, pa, 1, 'a');
  await expectError(() => assign(org, ev, pb, 1, 'a'), 'slot_taken');
  const t1 = await team(ev, 1);
  assert(t1.player_a_id === pa, 'the occupant stays');
  await assign(org, ev, pa, 1, 'a'); // the same player again: a no-op
  await assign(org, ev, pb, 3, 'b'); // a stand-by team
  await expectError(() => assign(org, ev, pb, 4, 'a'), 'invalid_team');
  const g = await rpc(org.jwt, 'organizer_add_guest_to_team', { p_event_id: ev, p_team_number: 3, p_slot: 'a', p_name: 'Standby Guest' });
  assert((await team(ev, 3)).player_a_id === g && (await team(ev, 3)).is_confirmed, 'guest completes stand-by team 3');
});

await run('R3: completing a pair past capacity is refused and rolled back', async () => {
  const org = await user('r3b-org');
  const [a, b, c, d] = [await user('r3b-a'), await user('r3b-b'), await user('r3b-c'), await user('r3b-d')];
  const ev = await teamEvent(org, [a, b, c, d]); // 1 court, no stand-by: 4 spots
  const [pa, pb, pc, pd] = [await interested(ev, a), await interested(ev, b), await interested(ev, c), await interested(ev, d)];
  await assign(org, ev, pa, 1, 'a');
  await assign(org, ev, pb, 1, 'b');
  // Two confirmed guests outside any team fill the other two spots.
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Loose One' });
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Loose Two' });
  await assign(org, ev, pc, 2, 'a');
  await expectError(() => assign(org, ev, pd, 2, 'b'), 'event_full');
  const t2 = await team(ev, 2);
  assert(t2.player_b_id === null && !t2.is_confirmed, 'rolled back: slot b still empty');
  assert((await part(ev, d)).status === 'interested', 'd is untouched');
});

// ---------------------------------------------------------------------------------------------
// R4 + MEVT-14
// ---------------------------------------------------------------------------------------------
await run('R4: removing a team player from the event reconciles their team', async () => {
  const org = await user('r4-org');
  const [a, b] = [await user('r4-a'), await user('r4-b')];
  const ev = await teamEvent(org, [a, b]);
  const pa = await interested(ev, a);
  const pb = await interested(ev, b);
  await assign(org, ev, pa, 1, 'a');
  await assign(org, ev, pb, 1, 'b');
  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: pa, p_mode: 'from_event' });
  const t1 = await team(ev, 1);
  assert(t1.player_a_id === null && t1.player_b_id === pb && !t1.is_confirmed, `team 1 half and unconfirmed, got ${JSON.stringify(t1)}`);
  assert((await part(ev, b)).status === 'invited', 'the teammate no longer holds a spot');
});

await run('MEVT-14: Remove on an Interested player sends them back to Invited', async () => {
  const org = await user('i14-org');
  const [a, b] = [await user('i14-a'), await user('i14-b')];
  const ev = await teamEvent(org, [a, b]);
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] }); // interested, request pending
  const pa = (await part(ev, a)).id;
  assert((await part(ev, a)).status === 'interested', 'a is interested');
  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: pa, p_mode: 'to_invited' });
  assert((await part(ev, a)) === undefined, 'no roster row');
  assert((await invOf(ev, a)).status === 'pending', 'a is invited again');
  assert((await invited(org, ev)).some((r) => r.user_id === a.id), 'and listed on the Invited tab');
  const reqs = await sel('partner_requests', `event_id=eq.${ev}&requester_id=eq.${a.id}&status=eq.pending&select=id`);
  assert(reqs.length === 0, "a's pending partner request is withdrawn");
});
