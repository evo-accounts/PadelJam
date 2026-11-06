// infra/supabase/tests/profile-private-reads.test.mjs
//
// Migration 0149 (PAD-133, PR 1): date of birth, gender and coordinates through definer functions,
// and coordinates rounded to ~1 km. Every call goes through PostgREST with a real JWT.
import { user, rpc, sel, patch, anonRpc, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const [alice, bob, carol, dan] = await Promise.all([
  user('ppr-a', { gender: 'female' }), user('ppr-b', { gender: 'male' }),
  user('ppr-c', { gender: 'female' }), user('ppr-d', { gender: 'male' }),
]);

async function groupOf(owner, privacy = 'public') {
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: `PPR ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: privacy,
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [g] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  return g.id;
}
const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'mixed', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: 'PPR', venue_id: null,
  manual_location_name: 'Arena', manual_location_address: null, has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(48), duration_minutes: 90, allow_standby: false, standby_spots: null,
  is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});

await run('get_my_private_profile returns the caller\'s own fields, and has no target argument', async () => {
  await patch('profiles', `id=eq.${alice.id}`, { date_of_birth: '1990-05-17' });
  await patch('profiles', `id=eq.${bob.id}`, { date_of_birth: '1985-01-02' });
  await rpc(alice.jwt, 'set_my_location', { p_lat: 38.7223412, p_lng: -9.1393367, p_text: 'Lisbon' });
  const [a] = await rpc(alice.jwt, 'get_my_private_profile');
  assert(a.date_of_birth === '1990-05-17' && a.gender === 'female', `own dob/gender, got ${JSON.stringify(a)}`);
  assert(a.lat === 38.72 && a.lng === -9.14, `coordinates are plain rounded doubles, got ${a.lat},${a.lng}`);
  const [b] = await rpc(bob.jwt, 'get_my_private_profile');
  assert(b.date_of_birth === '1985-01-02' && b.gender === 'male' && b.lat == null, "bob's own, not alice's");
  // No argument can retarget it: an extra one is not a known signature.
  await expectError(() => rpc(bob.jwt, 'get_my_private_profile', { p_target: alice.id }), 'PGRST202');
});

await run('anon cannot execute either function', async () => {
  await expectError(() => anonRpc('get_my_private_profile'), '42501');
  await expectError(() => anonRpc('event_participant_genders', { p_event_id: '00000000-0000-0000-0000-000000000000' }), '42501');
});

await run('set_my_location stores 2 decimals', async () => {
  const [row] = await sel('profiles', `id=eq.${alice.id}&select=location_point`); // service key
  assert(typeof row.location_point === 'string', 'a point is stored');
  const [a] = await rpc(alice.jwt, 'get_my_private_profile');
  assert(a.lat === 38.72 && a.lng === -9.14, '38.7223412, -9.1393367 became 38.72, -9.14');
  await rpc(alice.jwt, 'set_my_location', { p_lat: null, p_lng: null, p_text: 'x' });
  const [c] = await rpc(alice.jwt, 'get_my_private_profile');
  assert(c.lat == null && c.lng == null, 'null clears the point');
});

await run('genders: a visible mixed event returns them; blocked, non-mixed and invisible do not', async () => {
  const groupId = await groupOf(alice);
  const eventId = await rpc(alice.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  for (const p of [bob, carol, dan]) {
    await rpc(p.jwt, 'join_group', { p_group_id: groupId });
    await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  }
  const got = await rpc(bob.jwt, 'event_participant_genders', { p_event_id: eventId });
  const m = Object.fromEntries(got.map((r) => [r.user_id, r.gender]));
  assert(m[bob.id] === 'male' && m[carol.id] === 'female' && m[dan.id] === 'male', `genders returned, got ${JSON.stringify(m)}`);

  // A signed-in user who cannot see the event (private, not invited) gets nothing.
  const privId = await rpc(alice.jwt, 'create_event', { p_payload: payload(groupId, { is_private: true, name: 'Hidden' }) });
  const stranger = await user('ppr-s');
  assert((await rpc(stranger.jwt, 'event_participant_genders', { p_event_id: privId })).length === 0, 'invisible event: no rows');

  // A non-mixed event returns nothing even to its participants.
  const openId = await rpc(alice.jwt, 'create_event', { p_payload: payload(groupId, { specification: 'classic', name: 'Open' }) });
  await rpc(bob.jwt, 'join_event', { p_event_id: openId });
  assert((await rpc(bob.jwt, 'event_participant_genders', { p_event_id: openId })).length === 0, 'non-mixed event: no rows');

  // A block in either direction hides that participant.
  await rpc(bob.jwt, 'block_user', { p_target: dan.id });
  const after = await rpc(bob.jwt, 'event_participant_genders', { p_event_id: eventId });
  assert(!after.some((r) => r.user_id === dan.id) && after.some((r) => r.user_id === carol.id), 'blocked participant left out');
  const fromDan = await rpc(dan.jwt, 'event_participant_genders', { p_event_id: eventId });
  assert(!fromDan.some((r) => r.user_id === bob.id), 'and in the other direction');
  await rpc(bob.jwt, 'unblock_user', { p_target: dan.id });
});
