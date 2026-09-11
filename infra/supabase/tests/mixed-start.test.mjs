// infra/supabase/tests/mixed-start.test.mjs
import { user, rpc, sel, insert, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 3600_000).toISOString();

async function communityAndGroup(owner) {
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Mixed Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  return general.id;
}

const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'mixed', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: 'Mixed', venue_id: null,
  manual_location_name: 'Arena', manual_location_address: null, has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(48), duration_minutes: 90, allow_standby: false, standby_spots: null,
  is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});

await run('unbalanced mixed roster is refused before the capacity check', async () => {
  const org = await user('org');
  const groupId = await communityAndGroup(org);
  const players = [];
  for (const [i, g] of ['male', 'male', 'male', 'male', 'female', 'female', 'female'].entries()) {
    players.push(await user(`p${i}`, { gender: g }));
  }
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { num_courts: 2 }) });
  for (const p of players) {
    await rpc(p.jwt, 'join_group', { p_group_id: groupId });   // public group: joining also adds community membership
    await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  }
  // 7 confirmed on 2 courts would be setup_incomplete; the gender problem must win.
  await expectError(() => rpc(org.jwt, 'start_event', { p_event_id: eventId }), 'mixed_unbalanced');
  const [ev] = await sel('events', `id=eq.${eventId}&select=status`);
  assert(ev.status === 'scheduled', 'event still scheduled');
});

await run('balanced mixed roster starts', async () => {
  const org = await user('org2');
  const groupId = await communityAndGroup(org);
  const players = [];
  for (const [i, g] of ['male', 'male', 'female', 'female'].entries()) players.push(await user(`q${i}`, { gender: g }));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  for (const p of players) {
    await rpc(p.jwt, 'join_group', { p_group_id: groupId });   // public group: joining also adds community membership
    await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  }
  await rpc(org.jwt, 'start_event', { p_event_id: eventId });
  const [ev] = await sel('events', `id=eq.${eventId}&select=status`);
  assert(ev.status === 'in_progress', 'event started');
});

await run('a confirmed guest without gender blocks the start', async () => {
  const org = await user('org3');
  const groupId = await communityAndGroup(org);
  const players = [];
  for (const [i, g] of ['male', 'female', 'female'].entries()) players.push(await user(`r${i}`, { gender: g }));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  for (const p of players) {
    await rpc(p.jwt, 'join_group', { p_group_id: groupId });   // public group: joining also adds community membership
    await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  }
  // add_manual_participant enforces gender on mixed events, so the null-gender row is inserted directly.
  await insert('event_participants', { event_id: eventId, guest_name: 'Guest', status: 'confirmed', confirmed_at: new Date().toISOString(), invited_by: org.id });
  await expectError(() => rpc(org.jwt, 'start_event', { p_event_id: eventId }), 'mixed_gender_missing');
});

await run('classic events are untouched', async () => {
  const org = await user('org4');
  const groupId = await communityAndGroup(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`s${i}`, { gender: 'male' }));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { specification: 'classic' }) });
  for (const p of players) {
    await rpc(p.jwt, 'join_group', { p_group_id: groupId });   // public group: joining also adds community membership
    await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  }
  await rpc(org.jwt, 'start_event', { p_event_id: eventId });
  const [ev] = await sel('events', `id=eq.${eventId}&select=status`);
  assert(ev.status === 'in_progress', 'classic event started');
});
