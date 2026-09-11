// infra/supabase/tests/notifications.test.mjs
import { user, rpc, sel, del, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 3600_000).toISOString();

async function groupFor(owner) {
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Notif Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  return general.id;
}
const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'mexicano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: 'Notif Event', venue_id: null,
  manual_location_name: 'Arena', manual_location_address: null, has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(48), duration_minutes: 90, allow_standby: false, standby_spots: null,
  is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const notifs = (userId, type, eventId) =>
  sel('notifications', `user_id=eq.${userId}&type=eq.${type}&event_id=eq.${eventId}&select=id,ref_id,cta_done,read_at`);

await run('organizer is notified once per player who confirms', async () => {
  const org = await user('org');
  const groupId = await groupFor(org);
  const p1 = await user('p1');
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  // create_event invites every group member; drop those so players arrive as plain joiners (not invitees).
  await del('event_invitations', `event_id=eq.${eventId}`);
  await rpc(p1.jwt, 'join_group', { p_group_id: groupId });
  await rpc(p1.jwt, 'join_event', { p_event_id: eventId });
  const rows = await notifs(org.id, 'participant_confirmed', eventId);
  assert(rows.length === 1, `one participant_confirmed for the organizer, got ${rows.length}`);
});

await run('organizer playing their own event does not notify themselves', async () => {
  const org = await user('org2');
  const groupId = await groupFor(org);
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { organizer_role: 'organizing_and_playing' }) });
  const rows = await notifs(org.id, 'participant_confirmed', eventId);
  assert(rows.length === 0, 'no self-notification');
});

await run('a freed confirmed spot is offered to the first waiter, who claims it', async () => {
  const org = await user('org3');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`c${i}`));
  const w1 = await user('w1');
  const w2 = await user('w2');
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) { await rpc(p.jwt, 'join_group', { p_group_id: groupId }); await rpc(p.jwt, 'join_event', { p_event_id: eventId }); }
  await rpc(w1.jwt, 'join_group', { p_group_id: groupId });
  assert((await rpc(w1.jwt, 'join_event', { p_event_id: eventId })) === 'waiting_list', 'w1 waits');
  await rpc(w2.jwt, 'join_group', { p_group_id: groupId });
  assert((await rpc(w2.jwt, 'join_event', { p_event_id: eventId })) === 'waiting_list', 'w2 waits');

  await rpc(players[0].jwt, 'leave_event', { p_event_id: eventId });
  const offered = await notifs(w1.id, 'waitlist_spot', eventId);
  assert(offered.length === 1, `w1 offered once, got ${offered.length}`);
  const [w1part] = await sel('event_participants', `event_id=eq.${eventId}&user_id=eq.${w1.id}&select=id`);
  assert(offered[0].ref_id === w1part.id, 'offer references the waiter participant row');
  assert((await notifs(w2.id, 'waitlist_spot', eventId)).length === 0, 'w2 not offered');

  // Leaving again before the claim must not duplicate the offer.
  await rpc(players[1].jwt, 'leave_event', { p_event_id: eventId });
  assert((await notifs(w1.id, 'waitlist_spot', eventId)).length === 1, 'still one offer for w1');

  assert((await rpc(w1.jwt, 'claim_waitlist_spot', { p_event_id: eventId })) === 'confirmed', 'w1 confirmed');
  const [w1row] = await sel('event_participants', `event_id=eq.${eventId}&user_id=eq.${w1.id}&select=status,waiting_list_position`);
  assert(w1row.status === 'confirmed' && w1row.waiting_list_position === null, 'w1 row confirmed');
  const [w2row] = await sel('event_participants', `event_id=eq.${eventId}&user_id=eq.${w2.id}&select=status,waiting_list_position`);
  assert(w2row.status === 'waiting_list' && w2row.waiting_list_position === 1, 'w2 renumbered to 1');
  // w1's claim freed nothing, but the second leave did: w2 must now hold an offer of their own.
  assert((await notifs(w2.id, 'waitlist_spot', eventId)).length === 1, 'w2 offered after w1 claimed');
  const closed = await notifs(w1.id, 'waitlist_spot', eventId);
  assert(closed.length === 1 && closed.every((n) => n.cta_done && n.read_at), 'claim closes the claimant offers server-side');
});

await run('claiming with no free spot raises spot_taken; non-waiters are refused', async () => {
  const org = await user('org4');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`d${i}`));
  const w1 = await user('w3');
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) { await rpc(p.jwt, 'join_group', { p_group_id: groupId }); await rpc(p.jwt, 'join_event', { p_event_id: eventId }); }
  await rpc(w1.jwt, 'join_group', { p_group_id: groupId });
  await rpc(w1.jwt, 'join_event', { p_event_id: eventId });
  await expectError(() => rpc(w1.jwt, 'claim_waitlist_spot', { p_event_id: eventId }), 'spot_taken');
  await expectError(() => rpc(players[0].jwt, 'claim_waitlist_spot', { p_event_id: eventId }), 'not_on_waiting_list');
});

await run('organizer removal also offers the spot', async () => {
  const org = await user('org5');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`e${i}`));
  const w1 = await user('w4');
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) { await rpc(p.jwt, 'join_group', { p_group_id: groupId }); await rpc(p.jwt, 'join_event', { p_event_id: eventId }); }
  await rpc(w1.jwt, 'join_group', { p_group_id: groupId });
  await rpc(w1.jwt, 'join_event', { p_event_id: eventId });
  const [row] = await sel('event_participants', `event_id=eq.${eventId}&user_id=eq.${players[0].id}&select=id`);
  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: row.id, p_mode: 'from_event' });
  assert((await notifs(w1.id, 'waitlist_spot', eventId)).length === 1, 'offered after removal');
});

await run('finishing notifies every confirmed player including an organizer who played', async () => {
  const org = await user('org6');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2]) players.push(await user(`f${i}`));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { organizer_role: 'organizing_and_playing', starts_at: hoursFromNow(8) }) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) { await rpc(p.jwt, 'join_group', { p_group_id: groupId }); await rpc(p.jwt, 'join_event', { p_event_id: eventId }); }
  await rpc(org.jwt, 'start_event', { p_event_id: eventId });
  const rounds = await sel('event_rounds', `event_id=eq.${eventId}&select=id`);
  const matches = await sel('event_matches', `round_id=eq.${rounds[0].id}&select=id`);
  for (const m of matches) await rpc(org.jwt, 'submit_score', { p_match_id: m.id, p_side_a: 24, p_side_b: 16, p_not_played: false });
  await rpc(org.jwt, 'finish_event', { p_event_id: eventId, p_finish_message: null, p_counts_override: true });
  for (const p of [...players, org]) {
    assert((await notifs(p.id, 'results_published', eventId)).length === 1, `results_published for ${p.id}`);
  }
});

await run('finishing does not notify an organizer who did not play', async () => {
  const org = await user('org7');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`g${i}`));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { starts_at: hoursFromNow(8) }) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) { await rpc(p.jwt, 'join_group', { p_group_id: groupId }); await rpc(p.jwt, 'join_event', { p_event_id: eventId }); }
  await rpc(org.jwt, 'start_event', { p_event_id: eventId });
  const rounds = await sel('event_rounds', `event_id=eq.${eventId}&select=id`);
  const matches = await sel('event_matches', `round_id=eq.${rounds[0].id}&select=id`);
  for (const m of matches) await rpc(org.jwt, 'submit_score', { p_match_id: m.id, p_side_a: 24, p_side_b: 16, p_not_played: false });
  await rpc(org.jwt, 'finish_event', { p_event_id: eventId, p_finish_message: null, p_counts_override: true });
  assert((await notifs(org.id, 'results_published', eventId)).length === 0, 'organizer not notified');
  assert((await notifs(players[0].id, 'results_published', eventId)).length === 1, 'player notified');
});

await run('a confirmation performed by the organizer does not notify the organizer', async () => {
  const org = await user('org8');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`h${i}`));
  const waiter = await user('h4');
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) { await rpc(p.jwt, 'join_group', { p_group_id: groupId }); await rpc(p.jwt, 'join_event', { p_event_id: eventId }); }
  await rpc(waiter.jwt, 'join_group', { p_group_id: groupId });
  assert((await rpc(waiter.jwt, 'join_event', { p_event_id: eventId })) === 'waiting_list', 'fifth player waits');
  assert((await notifs(org.id, 'participant_confirmed', eventId)).length === 4, 'four player-initiated confirmations');
  // The organizer promotes the waiter from the roster: waiting_list → confirmed, performed by the organizer.
  const [row] = await sel('event_participants', `event_id=eq.${eventId}&user_id=eq.${waiter.id}&select=id`);
  await rpc(org.jwt, 'organizer_mark_confirmed', { p_participant_id: row.id });
  const [after] = await sel('event_participants', `id=eq.${row.id}&select=status`);
  assert(after.status === 'confirmed', 'waiter is now confirmed');
  assert((await notifs(org.id, 'participant_confirmed', eventId)).length === 4, 'organizer-performed confirmation adds nothing');
  // Re-confirming an already confirmed row is a no-op too.
  await rpc(org.jwt, 'organizer_mark_confirmed', { p_participant_id: row.id });
  assert((await notifs(org.id, 'participant_confirmed', eventId)).length === 4, 'still four');
});

await run('finishing twice does not publish results twice', async () => {
  const org = await user('org9');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`k${i}`));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { starts_at: hoursFromNow(8) }) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) { await rpc(p.jwt, 'join_group', { p_group_id: groupId }); await rpc(p.jwt, 'join_event', { p_event_id: eventId }); }
  await rpc(org.jwt, 'start_event', { p_event_id: eventId });
  const rounds = await sel('event_rounds', `event_id=eq.${eventId}&select=id`);
  const matches = await sel('event_matches', `round_id=eq.${rounds[0].id}&select=id`);
  for (const m of matches) await rpc(org.jwt, 'submit_score', { p_match_id: m.id, p_side_a: 24, p_side_b: 16, p_not_played: false });
  await rpc(org.jwt, 'finish_event', { p_event_id: eventId, p_finish_message: null, p_counts_override: true });
  await rpc(org.jwt, 'finish_event', { p_event_id: eventId, p_finish_message: 'edited', p_counts_override: true });
  assert((await notifs(players[0].id, 'results_published', eventId)).length === 1, 'one results_published after two finishes');
});

await run('the internal offer helper is not callable through the API', async () => {
  const someone = await user('nobody');
  await expectError(() => rpc(someone.jwt, 'notify_waitlist_spot', { p_event_id: '00000000-0000-0000-0000-000000000000', p_actor: null }), '42501');
});
