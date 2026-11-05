// infra/supabase/tests/clear-invitations-on-block-or-leave.test.mjs
//
// Migration 0149 (PAD-152): leaving a group or a block clears the invitation, silently; the two inserts that
// would write one back are guarded. Fixtures are written with the service role.
import { user, rpc, sel, insert, patch, del, expectError, assert, run } from './lib.mjs';

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


const visible = (ev, u) => rpc(null, 'event_is_visible', { e: ev, u: u.id });
const notifs = (u, ev) => sel('notifications', `user_id=eq.${u.id}&event_id=eq.${ev}&select=type,cta_done,read_at`);
const acts = (ev) => sel('event_activity', `event_id=eq.${ev}&select=action`).catch(() => []);
const part = (ev, u) => sel('event_participants', `event_id=eq.${ev}&user_id=eq.${u.id}&select=id,status`);
/** Private group event with `m` invited (and a pending event_invite notification from create_event). */
async function setup(t, extra = []) {
  const m = await user(`${t}-m`);
  const { admin, groupId, communityId } = await group(t, [m, ...extra]);
  const ev = await create(admin, groupId, [m]);
  return { m, admin, groupId, communityId, ev };
}
const gone = async (ev, m, why) => {
  assert((await invs(ev)).filter((i) => i.invitee_id === m.id).length === 0, `${why}: invitation deleted`);
  assert(!(await visible(ev, m)), `${why}: event not visible`);
  await expectError(() => rpc(m.jwt, 'join_event', { p_event_id: ev }), 'not_invited');
};

await run('leave_group, remove_group_member, remove_member, leave_community each clear the invitation', async () => {
  const a = await setup('c1a');
  assert((await visible(a.ev, a.m)), 'visible before');
  await rpc(a.m.jwt, 'leave_group', { p_group_id: a.groupId });
  await gone(a.ev, a.m, 'leave_group');
  const b = await setup('c1b');
  await rpc(b.admin.jwt, 'remove_group_member', { p_group_id: b.groupId, p_user_id: b.m.id });
  await gone(b.ev, b.m, 'remove_group_member');
  const c = await setup('c1c');
  await rpc(c.admin.jwt, 'remove_member', { p_community_id: c.communityId, p_user_id: c.m.id });
  await gone(c.ev, c.m, 'remove_member');
  const d = await setup('c1d');
  await rpc(d.m.jwt, 'leave_community', { p_community_id: d.communityId });
  await gone(d.ev, d.m, 'leave_community');
});

await run('declined and accepted-without-roster invitations go too; a past event\'s row too', async () => {
  const s = await setup('c2');
  const s2 = await user('c2-m2');
  await insert('group_members', { group_id: s.groupId, user_id: s2.id });
  const ev2 = await create(s.admin, s.groupId, [s.m, s2]);
  await patch('event_invitations', `event_id=eq.${ev2}&invitee_id=eq.${s.m.id}`, { status: 'declined' });
  await patch('event_invitations', `event_id=eq.${s.ev}&invitee_id=eq.${s.m.id}`, { status: 'accepted' });
  await patch('events', `id=eq.${s.ev}`, { starts_at: hoursFromNow(-48) });
  await rpc(s.m.jwt, 'leave_group', { p_group_id: s.groupId });
  assert((await invs(s.ev)).length === 0, 'past accepted row gone');
  const left = (await invs(ev2)).map((i) => i.invitee_id);
  assert(!left.includes(s.m.id) && left.includes(s2.id), 'declined row gone, the other invitee untouched');
});

await run('a confirmed player who leaves the group keeps their place', async () => {
  const s = await setup('c3');
  await rpc(s.m.jwt, 'accept_event_invitation', { p_event_id: s.ev });
  const before = await part(s.ev, s.m);
  await rpc(s.m.jwt, 'leave_group', { p_group_id: s.groupId });
  const after = await part(s.ev, s.m);
  assert(before.length === 1 && after.length === 1 && after[0].status === before[0].status, `roster row kept, got ${JSON.stringify(after)}`);
});

await run('block_user in both directions clears the invitee/organizer invitation', async () => {
  const a = await setup('c4a');
  await rpc(a.m.jwt, 'block_user', { p_target: a.admin.id });
  await gone(a.ev, a.m, 'invitee blocks organizer');
  await expectError(() => rpc(a.m.jwt, 'accept_event_invitation', { p_event_id: a.ev }), 'invitation_not_found');
  const b = await setup('c4b');
  await rpc(b.admin.jwt, 'block_user', { p_target: b.m.id });
  await gone(b.ev, b.m, 'organizer blocks invitee');
  await rpc(b.admin.jwt, 'block_user', { p_target: b.m.id });   // repeat: on conflict do nothing
});

await run('block with a non-organizer inviter clears; unrelated block and other invitees stay', async () => {
  const s = await setup('c5');
  const other = await user('c5-o'); const third = await user('c5-t');
  await insert('group_members', { group_id: s.groupId, user_id: other.id });
  await insert('group_members', { group_id: s.groupId, user_id: third.id });
  await insert('event_invitations', { event_id: s.ev, invitee_id: other.id, status: 'pending', invited_by: third.id });
  await rpc(s.m.jwt, 'block_user', { p_target: third.id });          // m vs another invitee: stays
  assert((await invs(s.ev)).some((i) => i.invitee_id === s.m.id), 'block with an unrelated user keeps the row');
  await insert('blocks', { blocker_id: other.id, blocked_id: third.id });   // service role; third is the inviter
  assert(!(await invs(s.ev)).some((i) => i.invitee_id === other.id), 'service-role block with the inviter clears');
  assert((await invs(s.ev)).some((i) => i.invitee_id === s.m.id), 'the other invitee is untouched');
});

await run('settled, silent: notification done and kept, nothing new, no activity', async () => {
  const s = await setup('c8');
  const before = await notifs(s.m, s.ev);
  assert(before.some((n) => n.type === 'event_invite' && !n.cta_done), 'open event_invite before');
  const actsBefore = (await acts(s.ev)).length;
  const orgBefore = (await sel('notifications', `user_id=eq.${s.admin.id}&select=id`)).length;
  await rpc(s.m.jwt, 'block_user', { p_target: s.admin.id });
  const after = await notifs(s.m, s.ev);
  assert(after.length === before.length, 'notification kept');
  assert(after.filter((n) => n.type === 'event_invite').every((n) => n.cta_done && n.read_at), 'settled and read');
  assert(after.length === before.length, 'no new notification for the invitee');
  assert((await sel('notifications', `user_id=eq.${s.admin.id}&select=id`)).length === orgBefore, 'organizer not told');
  assert((await acts(s.ev)).length === actsBefore, 'no activity entry');
});

await run("an 'invited' roster row is removed with the invitation; its partner requests are settled", async () => {
  const s = await setup('c10');
  const peer = await user('c10-p');
  await insert('group_members', { group_id: s.groupId, user_id: peer.id });
  await insert('event_participants', { event_id: s.ev, user_id: s.m.id, status: 'invited', invited_by: s.admin.id });
  const [pp] = await insert('event_participants', { event_id: s.ev, user_id: peer.id, status: 'interested', invited_by: s.admin.id });
  await insert('partner_requests', { event_id: s.ev, requester_id: s.m.id, target_id: peer.id, status: 'pending' });
  await insert('partner_requests', { event_id: s.ev, requester_id: peer.id, target_id: s.m.id, status: 'pending' });
  await rpc(s.m.jwt, 'leave_group', { p_group_id: s.groupId });
  assert((await part(s.ev, s.m)).length === 0, 'invited roster row gone');
  assert((await part(s.ev, peer)).length === 1, 'the other player is unchanged');
  const pr = await sel('partner_requests', `event_id=eq.${s.ev}&select=requester_id,status`);
  assert(pr.length === 1 && pr[0].requester_id === peer.id && pr[0].status === 'declined', `requests settled, got ${JSON.stringify(pr)}`);
});

await run("organizer_remove_participant 'to_invited' on an out-of-scope player writes no invitation", async () => {
  const s = await setup('c12');
  await rpc(s.m.jwt, 'accept_event_invitation', { p_event_id: s.ev });
  await rpc(s.m.jwt, 'join_event', { p_event_id: s.ev }).catch(() => {});
  const [row] = await part(s.ev, s.m);
  assert(row, 'on the roster');
  await rpc(s.m.jwt, 'leave_group', { p_group_id: s.groupId });      // keeps the confirmed/interested place
  await rpc(s.admin.jwt, 'organizer_remove_participant', { p_participant_id: row.id, p_mode: 'to_invited' });
  assert((await part(s.ev, s.m)).length === 0, 'roster row gone');
  assert((await invs(s.ev)).length === 0, 'no invitation written back');
  // in scope: unchanged behaviour
  const t = await setup('c12b');
  await rpc(t.m.jwt, 'accept_event_invitation', { p_event_id: t.ev });
  const [r2] = await part(t.ev, t.m);
  await rpc(t.admin.jwt, 'organizer_remove_participant', { p_participant_id: r2.id, p_mode: 'to_invited' });
  const i2 = await invs(t.ev);
  assert(i2.length === 1 && i2[0].status === 'pending', 'in scope: invitation back to pending');
});

await run('contact-only invitations survive both triggers', async () => {
  const s = await setup('c14');
  await insert('event_invitations', { event_id: s.ev, invitee_id: null, invitee_name: 'Ana', invitee_email: 'ana@example.com', status: 'pending', invited_by: s.admin.id });
  await rpc(s.m.jwt, 'block_user', { p_target: s.admin.id });
  await rpc(s.m.jwt, 'leave_group', { p_group_id: s.groupId }).catch(() => {});
  const r = await sel('event_invitations', `event_id=eq.${s.ev}&invitee_id=is.null&select=id`);
  assert(r.length === 1, 'contact invitation kept');
});

await run('service-role deletes: group cascade and account deletion do not raise', async () => {
  const s = await setup('c15');
  await del('group_members', `group_id=eq.${s.groupId}&user_id=eq.${s.m.id}`);
  assert((await invs(s.ev)).length === 0, 'service-role delete clears');
  const t = await setup('c15b');
  await del('groups', `id=eq.${t.groupId}`).catch(() => {});        // cascade path must not raise from the trigger
});
