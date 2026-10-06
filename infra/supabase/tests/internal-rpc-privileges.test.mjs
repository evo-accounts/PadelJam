// infra/supabase/tests/internal-rpc-privileges.test.mjs
// Internal SQL helpers must not be reachable through PostgREST (/rest/v1/rpc/<name>), while the
// public RPCs and triggers that call them keep working. See migration 0094 for the why.
import { user, rpc, anonRpc, req, sel, insert, expectError, assert, run } from './lib.mjs';

const ZERO = '00000000-0000-0000-0000-000000000000';
const DENIED = 'permission denied for function';

/** Every helper that is only ever called from SECURITY DEFINER bodies, with harmless arguments.
 *  The privilege check happens before the body runs, so the arguments never have to resolve. */
const INTERNAL = [
  ['_csv_field', { p: 'a,b' }],
  ['_reconcile_team', { p_team_id: ZERO }],
  ['_clear_team_slot', { p_event_id: ZERO, p_participant_id: ZERO }],
  ['_build_fours_arrangement', { p_ordered: [] }],
  ['_persist_round_matches', { p_event_id: ZERO, p_round_id: ZERO, p_arrangement: [] }],
  // 0126: the round engine's unit helpers.
  ['_engine_mode', { p_event_id: ZERO }],
  ['_engine_units', { p_event_id: ZERO }],
  ['_engine_place', { p_mode: 'classic', p_style: 'mexicano', p_courts: 1, p_units: [] }],
  ['_engine_side_ok', { p_event_id: ZERO, p_mode: 'team', p_side: [] }],
  ['notif_blocked', { u1: ZERO, u2: ZERO }],
  ['viewer_distance_m', { p: 'SRID=4326;POINT(-9.14 38.72)' }],
  ['placement_points', { p: 1 }],
  ['account_plan', { u: ZERO }],
  ['add_member_to_community', { p_community: ZERO, p_user: ZERO }],
  ['event_group_community', { e: ZERO }],
  ['event_capacity', { e: ZERO }],
  ['is_event_invitee', { e: ZERO, u: ZERO }],
  ['is_event_participant', { e: ZERO, u: ZERO }],
  // 0096: the masking helpers auth_methods_for calls. They are the reason no raw identifier can
  // leave the database, so a client that could call them directly would undo the whole mitigation.
  ['mask_email', { p_email: 'someone@example.com' }],
  ['mask_phone', { p_phone: '+351912345678' }],
  // 0136: the plan helpers behind the caps, and two functions nothing calls through the API.
  // account_has_feature took any user id, so it answered another user's Jammer+ status.
  ['community_has_feature', { c: ZERO, key: 'x' }],
  ['community_limit', { c: ZERO, key: 'x' }],
  ['account_has_feature', { u: ZERO, key: 'x' }],
  ['may_create_event', { c: ZERO }],
  ['persist_round', { p_payload: {} }],
];

const communityArgs = (name, privacy) => ({
  p_name: name, p_type: 'club', p_country: 'PT', p_privacy: privacy,
  p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
  p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
});
const eventPayload = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_and_playing', name: 'Privilege Event', venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: new Date(Date.now() + 3 * 864e5).toISOString(), duration_minutes: 90,
  allow_standby: false, standby_spots: 0, is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});

const owner = await user('irp-owner');
const players = [await user('irp-p1'), await user('irp-p2'), await user('irp-p3')];
const outsider = await user('irp-outsider');
const vaultOwner = await user('irp-vault-owner'); // an account may own only so many communities

await run('internal helpers are not callable as an authenticated user', async () => {
  for (const [name, args] of INTERNAL) {
    await expectError(() => rpc(outsider.jwt, name, args), DENIED);
  }
});

await run('internal helpers are not callable as anon', async () => {
  for (const [name, args] of INTERNAL) {
    await expectError(() => anonRpc(name, args), DENIED);
  }
});

// The other direction. auth_methods_for (0096) is the one function here that MUST be open to
// anon: "Try another way" runs before a session exists. A privilege sweep that closes it would
// break sign-in recovery silently — the sheet would just render empty — so pin it down.
await run('auth_methods_for IS callable as anon', async () => {
  const rows = await anonRpc('auth_methods_for', { p_identifier: `irp-nobody-${Date.now()}@rpctest.local` });
  assert(Array.isArray(rows) && rows.length === 1, 'returns table → exactly one row');
  assert(rows[0].has_email === false && rows[0].has_password === false, 'an unknown identifier has nothing');
});

const publicCid = await rpc(owner.jwt, 'create_community_with_personal_tenant', communityArgs('Privilege Club', 'public'));
await insert('community_subscriptions', { community_id: publicCid, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });
const privateCid = await rpc(vaultOwner.jwt, 'create_community_with_personal_tenant', communityArgs('Privilege Vault', 'private'));

await run('add_member_to_community cannot be used to walk into a private community', async () => {
  await expectError(() => rpc(outsider.jwt, 'add_member_to_community', { p_community: privateCid, p_user: outsider.id }), DENIED);
  const rows = await sel('community_members', `community_id=eq.${privateCid}&user_id=eq.${outsider.id}&select=user_id`);
  assert(rows.length === 0, 'outsider is not a member of the private community');
});

await run('join_community still works through its public RPC', async () => {
  for (const p of players) {
    assert((await rpc(p.jwt, 'join_community', { p_community_id: publicCid, p_ack: true })) === 'joined', 'joined');
  }
  const members = await sel('community_members', `community_id=eq.${publicCid}&select=user_id`);
  assert(members.length === players.length + 1, `community has owner + ${players.length} players`);
  // community_limit and account_has_feature were asserted here as callable; 0136 made them internal
  // (they are in INTERNAL above). The caps they feed are exercised through create_group below.
});

const gid = await rpc(owner.jwt, 'create_group', {
  p_community_id: publicCid, p_name: 'Privilege League', p_description: null, p_is_private: false, p_thumbnail_path: null,
});
for (const p of players) await rpc(p.jwt, 'join_group', { p_group_id: gid });

await run('a follow still notifies (trigger → notif_blocked)', async () => {
  const [a, b] = players;
  await req('/rest/v1/follows', { method: 'POST', jwt: a.jwt, body: { follower_id: a.id, followee_id: b.id }, prefer: 'return=minimal' });
  const notes = await sel('notifications', `user_id=eq.${b.id}&type=eq.follow&actor_id=eq.${a.id}&select=id`);
  assert(notes.length === 1, 'followee got a follow notification');
});

const eid = await rpc(owner.jwt, 'create_event', { p_payload: eventPayload(gid) });

await run('join_event, roster CSV, explore still work (event_capacity, _csv_field, viewer_distance_m)', async () => {
  for (const p of players) {
    assert((await rpc(p.jwt, 'join_event', { p_event_id: eid })) === 'confirmed', 'player confirmed');
  }
  const csv = await rpc(owner.jwt, 'event_roster_csv', { p_event_id: eid });
  assert(csv.startsWith('name,user_type,status') && csv.split('\n').length === 5, 'roster CSV has header + 4 rows');
  const explore = await rpc(outsider.jwt, 'explore_events', { p_limit: 50, p_offset: 0 });
  assert(explore.some((r) => r.event.id === eid), 'outsider sees the public event in explore');
});

await run('start, score and finish still work (_build_fours_arrangement, _persist_round_matches, placement_points)', async () => {
  await rpc(owner.jwt, 'start_event', { p_event_id: eid });
  const [round] = await sel('event_rounds', `event_id=eq.${eid}&select=id&order=round_number.desc&limit=1`);
  const matches = await sel('event_matches', `round_id=eq.${round.id}&select=id&order=match_number.asc`);
  assert(matches.length === 1, 'one court → one match in round 1');
  for (const m of matches) {
    await rpc(owner.jwt, 'submit_score', { p_match_id: m.id, p_side_a: 24, p_side_b: 16, p_not_played: false });
  }
  if ((await sel('group_seasons', `group_id=eq.${gid}&ended_at=is.null&select=id`)).length === 0) {
    await rpc(owner.jwt, 'start_new_season', { p_group_id: gid });
  }
  await rpc(owner.jwt, 'finish_event', { p_event_id: eid, p_finish_message: null, p_counts_override: true });
  const results = await sel('group_event_results', `event_id=eq.${eid}&select=ranking_points`);
  assert(results.length === 4, 'four ranked results were written');
});

await run('organizer team assignment still works (_clear_team_slot, _reconcile_team)', async () => {
  const teamEid = await rpc(owner.jwt, 'create_event', {
    p_payload: eventPayload(gid, { name: 'Privilege Team Cup', specification: 'team', organizer_role: 'organizing_only' }),
  });
  const [p1, p2] = await insert('event_participants', players.slice(0, 2).map((p) => ({ event_id: teamEid, user_id: p.id, status: 'invited' })));
  await rpc(owner.jwt, 'organizer_assign_to_team', { p_event_id: teamEid, p_participant_id: p1.id, p_team_number: 1, p_slot: 'a' });
  await rpc(owner.jwt, 'organizer_assign_to_team', { p_event_id: teamEid, p_participant_id: p2.id, p_team_number: 1, p_slot: 'b' });
  let [team] = await sel('event_teams', `event_id=eq.${teamEid}&team_number=eq.1&select=is_confirmed`);
  assert(team.is_confirmed === true, 'pair is confirmed');
  await rpc(owner.jwt, 'organizer_remove_from_team', { p_event_id: teamEid, p_participant_id: p1.id });
  [team] = await sel('event_teams', `event_id=eq.${teamEid}&team_number=eq.1&select=is_confirmed,player_a_id`);
  assert(team.is_confirmed === false && team.player_a_id === null, 'slot cleared and team demoted');
});
