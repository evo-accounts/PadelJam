// infra/supabase/tests/create-event-invitee-scope.test.mjs
//
// Migration 0146: create_event refuses the invitees invite_to_event refuses (user_not_found, blocked,
// not_group_member), before anything is written. Fixtures are written with the service role.
import { user, rpc, sel, insert, patch, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);

const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Scope ${tag()}${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: true, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const invitees = (...us) => us.map((u) => ({ invitee_id: u.id }));
const SERIES = { day_of_week: 3, start_time: '19:00', duration_minutes: 90, invite_lead_days: 7 };

/** Organizer (group admin) + community on Pro + a group with `members` (organizer is the admin). */
async function group(t, members = [], { isPrivate = true } = {}) {
  const admin = await user(`${t}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Scope ${t} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const groupId = await rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Scope', p_description: null, p_is_private: isPrivate, p_thumbnail_path: null,
  });
  for (const u of members) {
    await insert('community_members', { community_id: communityId, user_id: u.id, role: 'member' });
    await insert('group_members', { group_id: groupId, user_id: u.id });
  }
  return { admin, groupId, communityId };
}
const joinCommunity = (communityId, u) => insert('community_members', { community_id: communityId, user_id: u.id, role: 'member' });

const create = (org, groupId, list, over = {}) =>
  rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { invitees: invitees(...list), ...over }) });
const invs = (ev) => sel('event_invitations', `event_id=eq.${ev}&select=invitee_id,status`);
const nothingWritten = async (p) => {
  const evs = await sel('events', `name=eq.${encodeURIComponent(p.name)}&select=id`);
  assert(evs.length === 0, 'no events row after a refusal');
  if (p.series) {
    const ser = await sel('event_series', `group_id=eq.${p.group_id}&select=id`);
    assert(ser.length === 0, 'no event_series row after a refusal');
  }
};
/** Expect `code`, then that nothing was written for that payload. */
async function refused(org, groupId, list, code, over = {}) {
  const p = payload(groupId, { invitees: invitees(...list), ...over });
  await expectError(() => rpc(org.jwt, 'create_event', { p_payload: p }), code);
  await nothingWritten(p);
}
const softDelete = (u) => patch('profiles', `id=eq.${u.id}`, { deleted_at: new Date().toISOString() });

await run('private group event: a group member is invited', async () => {
  const m = await user('s1-m');
  const { admin, groupId } = await group('s1', [m]);
  const ev = await create(admin, groupId, [m]);
  const r = await invs(ev);
  assert(r.length === 1 && r[0].invitee_id === m.id && r[0].status === 'pending', `one pending invitation, got ${JSON.stringify(r)}`);
});

await run('private group event: a community member outside the group → not_group_member', async () => {
  const out = await user('s2-out');
  const { admin, groupId, communityId } = await group('s2');
  await joinCommunity(communityId, out);
  await refused(admin, groupId, [out], 'not_group_member');
});

await run('private group event: blocked either way → blocked; nothing written (also recurring)', async () => {
  const m1 = await user('s3-m1'); const m2 = await user('s3-m2');
  const { admin, groupId } = await group('s3', [m1, m2]);
  await rpc(m1.jwt, 'block_user', { p_target: admin.id });
  await refused(admin, groupId, [m1], 'blocked');
  await refused(admin, groupId, [m1], 'blocked', { series: SERIES });
  await rpc(admin.jwt, 'block_user', { p_target: m2.id });
  await refused(admin, groupId, [m2], 'blocked');
});

await run('private group event: deleted profile or unknown uuid → user_not_found; a good invitee first changes nothing', async () => {
  const m = await user('s4-m'); const ok = await user('s4-ok');
  const { admin, groupId } = await group('s4', [m, ok]);
  await softDelete(m);
  await refused(admin, groupId, [m], 'user_not_found');
  await refused(admin, groupId, [ok, m], 'user_not_found');
  const p = payload(groupId, { invitees: [{ invitee_id: crypto.randomUUID() }] });
  await expectError(() => rpc(admin.jwt, 'create_event', { p_payload: p }), 'user_not_found');
  await nothingWritten(p);
});

await run('standalone event: a live non-member is invited; blocked and deleted are refused', async () => {
  const org = await user('s6-org'); const live = await user('s6-live');
  const blk = await user('s6-blk'); const gone = await user('s6-gone');
  const ev = await create(org, null, [live]);
  assert((await invs(ev)).length === 1, 'invited');
  await rpc(blk.jwt, 'block_user', { p_target: org.id });
  await refused(org, null, [blk], 'blocked');
  await softDelete(gone);
  await refused(org, null, [gone], 'user_not_found');
});

await run('the organizer in their own list and a duplicated id → one invitation per invitee', async () => {
  const org = await user('s7-org'); const a = await user('s7-a'); const b = await user('s7-b');
  const ev = await create(org, null, [org, a, a, b, a]);
  const r = await invs(ev);
  assert(r.length === 2, `two invitations, got ${r.length}`);
  assert(!r.some((x) => x.invitee_id === org.id), 'none for the organizer');
  assert(r.filter((x) => x.invitee_id === a.id).length === 1, 'one for the duplicated id');
});

await run('public group event: invitees (even an outsider) are ignored, no invitations', async () => {
  const m = await user('s8-m'); const out = await user('s8-out');
  const { admin, groupId } = await group('s8', [m], { isPrivate: false });
  const ev = await create(admin, groupId, [out], { is_private: false });
  assert((await invs(ev)).length === 0, 'no invitations');
});
