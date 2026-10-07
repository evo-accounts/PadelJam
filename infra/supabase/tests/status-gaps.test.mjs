// infra/supabase/tests/status-gaps.test.mjs
// Migration 0141: six checks SECURITY DEFINER bodies skipped. Each "cannot" below worked before
// 0141 — a result post from an organizer who may not post in the community (or into an archived
// one, or for a deleted event), a round added to a finished or deleted event, joining or accepting
// into an archived community or group, asking whether SOMEONE ELSE may invite into, or
// administers, a private group you cannot even see, and inviting someone into a community or group
// across a block. Each "can" is the legitimate path beside it, which must keep working: a result
// post past rows planted before 0137, and the policies and functions that call is_group_admin —
// both policies, start_new_season, group_member_list, my_groups, remove_group_member and
// add_group_admins on a private group, archive_group and unarchive_group on a public one (§3).
import { user, rpc, anonRpc, req, sel, insert, patch, expectError, assert, run } from './lib.mjs';

const DENIED = 'permission denied for function';
const communityArgs = (name, privacy) => ({
  p_name: name, p_type: 'club', p_country: 'PT', p_privacy: privacy,
  p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
  p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
});
const eventPayload = (groupId) => ({
  group_id: groupId, event_type: 'mexicano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Gaps ${Math.random().toString(36).slice(2, 8)}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: new Date(Date.now() + 72 * 36e5).toISOString(), duration_minutes: 90,
  allow_standby: true, standby_spots: 4, is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null,
});
const selAs = (jwt, table, qs) => req(`/rest/v1/${table}?${qs}`, { jwt });
const generalGroup = async (cid) => (await sel('groups', `community_id=eq.${cid}&is_general=eq.true&select=id`))[0].id;
const membership = async (cid, uid) =>
  (await sel('community_members', `community_id=eq.${cid}&user_id=eq.${uid}&select=role`))[0] ?? null;
const inGroup = async (gid, uid) =>
  (await sel('group_members', `group_id=eq.${gid}&user_id=eq.${uid}&select=user_id`)).length === 1;
const resultPosts = async (ev) => (await sel('community_posts', `result_event_id=eq.${ev}&select=id`)).length;
const rounds = async (ev) => sel('event_rounds', `event_id=eq.${ev}&order=round_number.asc&select=round_number,status`);

/** An event in `groupId` by `org`: four confirmed guests (service role, as engine-pairs does), round 1
 *  started and scored through PostgREST. `finish` completes it. */
async function playedEvent(org, groupId, { finish }) {
  const ev = await rpc(org.jwt, 'create_event', { p_payload: eventPayload(groupId) });
  await insert('event_participants', [1, 2, 3, 4].map((i) => ({
    event_id: ev, guest_name: `G${i}`, guest_gender: 'male', status: 'confirmed', confirmed_at: new Date().toISOString(),
  })));
  await rpc(org.jwt, 'start_event', { p_event_id: ev });
  for (const m of await sel('event_matches', `event_id=eq.${ev}&status=eq.pending&select=id`)) {
    await rpc(org.jwt, 'submit_score', { p_match_id: m.id, p_side_a: 6, p_side_b: 2 });
  }
  if (finish) await rpc(org.jwt, 'finish_event', { p_event_id: ev });
  return ev;
}

// ── 1. post_event_result ─────────────────────────────────────────────────────────────────────────
const feedAdmin = await user('sg-feed-admin');
const organizer = await user('sg-feed-org');
const leaver = await user('sg-feed-leaver');
const C = await rpc(feedAdmin.jwt, 'create_community_with_personal_tenant', communityArgs('Result Feed Club', 'public'));
const Cgen = await generalGroup(C);
await rpc(organizer.jwt, 'join_community', { p_community_id: C, p_ack: false });
await rpc(leaver.jwt, 'join_community', { p_community_id: C, p_ack: false });

await run('an organizer who left the community cannot post the result into its feed', async () => {
  const ev = await playedEvent(leaver, Cgen, { finish: true });
  await rpc(leaver.jwt, 'leave_community', { p_community_id: C });
  await expectError(() => rpc(leaver.jwt, 'post_event_result', { p_event_id: ev }), 'forbidden');
  assert((await resultPosts(ev)) === 0, 'no result post');
});

await run('an organizer who is still a member posts the result, once', async () => {
  const ev = await playedEvent(organizer, Cgen, { finish: true });
  const postId = await rpc(organizer.jwt, 'post_event_result', { p_event_id: ev });
  const [post] = await sel('community_posts', `id=eq.${postId}&select=community_id,author_id,kind,result_event_id`);
  assert(post?.community_id === C && post.author_id === organizer.id && post.kind === 'result' && post.result_event_id === ev,
    'the result post is in the community, by the organizer');
  await expectError(() => rpc(organizer.jwt, 'post_event_result', { p_event_id: ev }), 'already_posted');
});

await run('the organizer cannot post the result of a deleted event', async () => {
  const ev = await playedEvent(organizer, Cgen, { finish: true });
  await patch('events', `id=eq.${ev}`, { deleted_at: new Date().toISOString() });
  await expectError(() => rpc(organizer.jwt, 'post_event_result', { p_event_id: ev }), 'event_not_found');
  assert((await resultPosts(ev)) === 0, 'no result post for a deleted event');
});

await run('rows planted before 0137 do not lock the organizer out; only their own result post does', async () => {
  // One row per condition _event_result_posted_to (0139) trusts, each failing just that one: what a
  // member or an admin could write before 0137 (kind and result_event_id were client-writable, and
  // "posts: update" let an admin rewrite any post). The service key stands in for those old writes.
  const ev = await playedEvent(organizer, Cgen, { finish: true });
  const Other = await rpc(feedAdmin.jwt, 'create_community_with_personal_tenant', communityArgs('Other Feed Club', 'public'));
  // (A bulk insert needs the same keys in every row, hence two calls.)
  await insert('community_posts', [
    { community_id: C, author_id: organizer.id, kind: 'user', body: 'typed by hand', result_event_id: ev }, // not kind 'result'
    { community_id: C, author_id: leaver.id, kind: 'result', body: null, result_event_id: ev },             // not the organizer's
    { community_id: Other, author_id: organizer.id, kind: 'result', body: null, result_event_id: ev },      // another community
  ]);
  await insert('community_posts', {                                                                       // updated since written
    community_id: C, author_id: organizer.id, kind: 'result', result_event_id: ev,
    created_at: new Date(Date.now() - 2 * 864e5).toISOString(), updated_at: new Date(Date.now() - 864e5).toISOString(),
  });
  const postId = await rpc(organizer.jwt, 'post_event_result', { p_event_id: ev });
  const [post] = await sel('community_posts', `id=eq.${postId}&select=community_id,author_id,kind`);
  assert(post?.community_id === C && post.author_id === organizer.id && post.kind === 'result', 'the real result post landed');
  assert((await resultPosts(ev)) === 5, 'beside the four planted rows');
  await expectError(() => rpc(organizer.jwt, 'post_event_result', { p_event_id: ev }), 'already_posted');
});

await run('with member posts switched off, a member organizer cannot post a result; an admin organizer still can', async () => {
  const evMember = await playedEvent(organizer, Cgen, { finish: true });
  const evAdmin = await playedEvent(feedAdmin, Cgen, { finish: true });
  await patch('community_permissions', `community_id=eq.${C}`, { create_posts: false });
  try {
    await expectError(() => rpc(organizer.jwt, 'post_event_result', { p_event_id: evMember }), 'forbidden');
    assert((await resultPosts(evMember)) === 0, 'no post from the member');
    const postId = await rpc(feedAdmin.jwt, 'post_event_result', { p_event_id: evAdmin });
    assert(typeof postId === 'string' && (await resultPosts(evAdmin)) === 1, 'the admin posted');
  } finally {
    await patch('community_permissions', `community_id=eq.${C}`, { create_posts: true });
  }
});

await run('nobody posts a result into an archived community; once unarchived, the organizer can', async () => {
  const evMember = await playedEvent(organizer, Cgen, { finish: true });
  const evAdmin = await playedEvent(feedAdmin, Cgen, { finish: true });
  await rpc(feedAdmin.jwt, 'archive_community', { p_community_id: C, p_archive: true });
  try {
    await expectError(() => rpc(organizer.jwt, 'post_event_result', { p_event_id: evMember }), 'forbidden');
    await expectError(() => rpc(feedAdmin.jwt, 'post_event_result', { p_event_id: evAdmin }), 'forbidden');
    assert((await resultPosts(evMember)) === 0 && (await resultPosts(evAdmin)) === 0, 'no result post while archived');
  } finally {
    await rpc(feedAdmin.jwt, 'archive_community', { p_community_id: C, p_archive: false });
  }
  await rpc(organizer.jwt, 'post_event_result', { p_event_id: evMember });
  assert((await resultPosts(evMember)) === 1, 'posted once the community is back');
});

// ── 2. generate_next_round ───────────────────────────────────────────────────────────────────────
await run('the organizer cannot add a round to a finished event', async () => {
  const ev = await playedEvent(organizer, Cgen, { finish: true });
  await expectError(() => rpc(organizer.jwt, 'generate_next_round', { p_event_id: ev }), 'event_not_in_progress');
  assert((await rounds(ev)).length === 1, 'still only the round that was played');
});

await run('the organizer cannot add a round to a deleted event that was in progress', async () => {
  const ev = await playedEvent(organizer, Cgen, { finish: false });
  await patch('events', `id=eq.${ev}`, { deleted_at: new Date().toISOString() });
  await expectError(() => rpc(organizer.jwt, 'generate_next_round', { p_event_id: ev }), 'event_not_found');
  assert((await rounds(ev)).length === 1, 'still only the round that was played');
});

await run('the organizer adds the next round while the event is in progress', async () => {
  const ev = await playedEvent(organizer, Cgen, { finish: false });
  await rpc(organizer.jwt, 'generate_next_round', { p_event_id: ev });
  const rs = await rounds(ev);
  assert(rs.length === 2 && rs[0].status === 'completed' && rs[1].status === 'active', 'round 2 is the active one');
  await expectError(() => rpc(organizer.jwt, 'generate_next_round', { p_event_id: ev }), 'round_not_scored');
});

// ── 3. archived communities and groups (UX-COMM-24) ─────────────────────────────────────────────
const archOwner = await user('sg-arch-owner');
const invitee = await user('sg-arch-invitee');
const Pub = await rpc(archOwner.jwt, 'create_community_with_personal_tenant', communityArgs('Archived Pub', 'public'));
const Req = await rpc(archOwner.jwt, 'create_community_with_personal_tenant', communityArgs('Archived Queue', 'request_to_join'));
const Priv = await rpc(archOwner.jwt, 'create_community_with_personal_tenant', communityArgs('Archived Vault', 'private'));
const PubGen = await generalGroup(Pub);
await rpc(archOwner.jwt, 'invite_to_community', { p_community_id: Priv, p_invitee_ids: [invitee.id] });
await rpc(archOwner.jwt, 'invite_to_group', { p_group_id: PubGen, p_invitee_id: invitee.id });
const [privInvitation] = await sel('community_invitations', `community_id=eq.${Priv}&invitee_id=eq.${invitee.id}&select=id`);

await run('nobody joins, requests or accepts their way into an archived community', async () => {
  for (const cid of [Pub, Req, Priv]) await rpc(archOwner.jwt, 'archive_community', { p_community_id: cid, p_archive: true });
  await expectError(() => rpc(invitee.jwt, 'join_community', { p_community_id: Pub, p_ack: false }), 'forbidden');
  await expectError(() => rpc(invitee.jwt, 'join_community', { p_community_id: Req, p_ack: false }), 'forbidden');
  await expectError(() => rpc(invitee.jwt, 'join_community', { p_community_id: Priv, p_ack: false }), 'forbidden');
  await expectError(() => rpc(invitee.jwt, 'accept_invitation', { p_invitation_id: privInvitation.id, p_ack: true }), 'forbidden');
  await expectError(() => rpc(invitee.jwt, 'accept_group_invitation', { p_group_id: PubGen, p_ack: true }), 'forbidden');
  for (const cid of [Pub, Req, Priv]) assert((await membership(cid, invitee.id)) === null, `not a member of ${cid}`);
  assert(!(await inGroup(PubGen, invitee.id)), 'not in the archived general group');
  assert((await sel('community_join_requests', `community_id=eq.${Req}&user_id=eq.${invitee.id}&select=id`)).length === 0,
    'no request queued');
  const [inv] = await sel('community_invitations', `id=eq.${privInvitation.id}&select=status`);
  assert(inv.status === 'pending', 'the invitation is kept for when it is unarchived');
});

await run('once unarchived, the same joins, request and invitations work', async () => {
  for (const cid of [Pub, Req, Priv]) await rpc(archOwner.jwt, 'archive_community', { p_community_id: cid, p_archive: false });
  assert((await rpc(invitee.jwt, 'join_community', { p_community_id: Pub, p_ack: false })) === 'joined', 'joins the public one');
  assert((await rpc(invitee.jwt, 'join_community', { p_community_id: Req, p_ack: false })) === 'requested', 'requests the other');
  await rpc(invitee.jwt, 'accept_invitation', { p_invitation_id: privInvitation.id, p_ack: true });
  assert((await membership(Priv, invitee.id))?.role === 'member', 'accepted into the private one');
  await rpc(invitee.jwt, 'accept_group_invitation', { p_group_id: PubGen, p_ack: true });
  assert(await inGroup(PubGen, invitee.id), 'in the general group');
});

await run('an invitation to an archived group of a live community cannot be accepted; unarchived, it can', async () => {
  const owner = await user('sg-arch-group-owner');
  const guest = await user('sg-arch-group-guest');
  const L = await rpc(owner.jwt, 'create_community_with_personal_tenant', communityArgs('Live Club', 'public'));
  await insert('community_subscriptions', { community_id: L, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const side = await rpc(owner.jwt, 'create_group', { p_community_id: L, p_name: 'Side court', p_is_private: false });
  await rpc(owner.jwt, 'invite_to_group', { p_group_id: side, p_invitee_id: guest.id });
  await rpc(owner.jwt, 'archive_group', { p_group_id: side });
  await expectError(() => rpc(guest.jwt, 'accept_group_invitation', { p_group_id: side, p_ack: true }), 'forbidden');
  assert(!(await inGroup(side, guest.id)) && (await membership(L, guest.id)) === null, 'in neither the group nor the community');
  await rpc(owner.jwt, 'unarchive_group', { p_group_id: side });
  await rpc(guest.jwt, 'accept_group_invitation', { p_group_id: side, p_ack: true });
  assert((await inGroup(side, guest.id)) && (await membership(L, guest.id))?.role === 'member', 'in both once unarchived');
});

// ── 4 + 5. may_invite_to_group and is_group_admin ───────────────────────────────────────────────
const vaultOwner = await user('sg-vault-owner');
const vaultMember = await user('sg-vault-member');
const prober = await user('sg-vault-prober');
const P2 = await rpc(vaultOwner.jwt, 'create_community_with_personal_tenant', communityArgs('Vault Two', 'private'));
await insert('community_subscriptions', { community_id: P2, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
const P2gen = await generalGroup(P2);
const squad = await rpc(vaultOwner.jwt, 'create_group', { p_community_id: P2, p_name: 'Squad', p_is_private: true });
await rpc(vaultOwner.jwt, 'invite_to_community', { p_community_id: P2, p_invitee_ids: [vaultMember.id] });
const [vmInv] = await sel('community_invitations', `community_id=eq.${P2}&invitee_id=eq.${vaultMember.id}&select=id`);
await rpc(vaultMember.jwt, 'accept_invitation', { p_invitation_id: vmInv.id, p_ack: true });

await run('an outsider, signed in or not, cannot learn who may invite into or administers a private group', async () => {
  assert((await selAs(prober.jwt, 'groups', `id=eq.${squad}&select=id`)).length === 0, 'the outsider cannot see the squad');
  assert((await rpc(prober.jwt, 'may_invite_to_group', { g: squad, u: vaultOwner.id })) === false, 'no invite answer about its admin');
  assert((await rpc(prober.jwt, 'may_invite_to_group', { g: P2gen, u: vaultMember.id })) === false, 'nor about a plain member');
  assert((await rpc(prober.jwt, 'is_group_admin', { g: squad, u: vaultOwner.id })) === false, 'no admin answer about its admin');
  // is_group_admin stays executable by anon (RLS policies call it), so anon gets an answer — false.
  assert((await anonRpc('is_group_admin', { g: squad, u: vaultOwner.id })) === false, 'anon gets false too');
  await expectError(() => anonRpc('may_invite_to_group', { g: squad, u: vaultOwner.id }), DENIED);
  // The rules themselves are internal.
  for (const fn of ['_may_invite_to_group', '_is_group_admin']) {
    await expectError(() => rpc(prober.jwt, fn, { g: squad, u: vaultOwner.id }), DENIED);
    await expectError(() => anonRpc(fn, { g: squad, u: vaultOwner.id }), DENIED);
  }
});

await run('both gates still answer for yourself', async () => {
  // useCanInviteToGroup: the client passes its own uid.
  assert((await rpc(vaultOwner.jwt, 'may_invite_to_group', { g: squad, u: vaultOwner.id })) === true, 'the admin may invite');
  assert((await rpc(vaultMember.jwt, 'may_invite_to_group', { g: P2gen, u: vaultMember.id })) === true, 'a member may (invite_members on)');
  assert((await rpc(vaultMember.jwt, 'may_invite_to_group', { g: squad, u: vaultMember.id })) === false, 'but not into a squad they are not in');
  assert((await rpc(vaultOwner.jwt, 'is_group_admin', { g: squad, u: vaultOwner.id })) === true, 'the owner administers the squad');
  assert((await rpc(vaultOwner.jwt, 'is_group_admin', { g: P2gen, u: vaultOwner.id })) === true, 'and the general group');
  assert((await rpc(vaultMember.jwt, 'is_group_admin', { g: P2gen, u: vaultMember.id })) === false, 'a plain member administers nothing');
});

await run("is_group_admin's policies and functions still work for the group admin, and only for them", async () => {
  // "groups: update"
  const edited = await req(`/rest/v1/groups?id=eq.${squad}`, {
    method: 'PATCH', jwt: vaultOwner.jwt, body: { description: 'Tuesdays' }, prefer: 'return=representation',
  });
  assert(edited.length === 1 && edited[0].description === 'Tuesdays', `the admin edits the squad, got ${JSON.stringify(edited)}`);
  const hijack = await req(`/rest/v1/groups?id=eq.${P2gen}`, {
    method: 'PATCH', jwt: vaultMember.jwt, body: { name: 'Hijacked' }, prefer: 'return=representation',
  });
  assert(Array.isArray(hijack) && hijack.length === 0, `a plain member edits nothing, got ${JSON.stringify(hijack)}`);
  // "group_invitations: read"
  await rpc(vaultOwner.jwt, 'invite_to_group', { p_group_id: squad, p_invitee_id: vaultMember.id });
  assert((await selAs(vaultOwner.jwt, 'group_invitations', `group_id=eq.${squad}&select=invitee_id`))
    .some((i) => i.invitee_id === vaultMember.id), "the admin reads the squad's invitations");
  assert((await selAs(vaultMember.jwt, 'group_invitations', `group_id=eq.${squad}&select=invitee_id`)).length === 1,
    'the invitee reads their own');
  assert((await selAs(prober.jwt, 'group_invitations', `group_id=eq.${squad}&select=invitee_id`)).length === 0,
    'an outsider reads none');
  // The SECURITY DEFINER callers.
  assert(Number.isInteger(await rpc(vaultOwner.jwt, 'start_new_season', { p_group_id: squad })), 'the admin starts a season');
  assert((await rpc(vaultOwner.jwt, 'group_member_list', { p_group_id: squad })).some((m) => m.user_id === vaultOwner.id),
    'the admin lists the squad');
  const mine = await rpc(vaultOwner.jwt, 'my_groups', { p_user: vaultOwner.id, p_include_archived: false });
  assert(mine.find((g) => g.group_id === squad)?.is_managing === true, 'my_groups marks the squad as managed');
  const theirs = await rpc(vaultMember.jwt, 'my_groups', { p_user: vaultMember.id, p_include_archived: false });
  assert(theirs.find((g) => g.group_id === P2gen)?.is_managing === false, 'but not the general group for a plain member');
  await expectError(() => rpc(vaultMember.jwt, 'start_new_season', { p_group_id: P2gen }), 'forbidden');
  // add_group_admins: the admin passes the gate (a no-op here — they are the squad's only admin and
  // already in it); a plain member and an outsider are refused at it.
  await rpc(vaultOwner.jwt, 'add_group_admins', { p_group_id: squad, p_user_ids: [vaultOwner.id] });
  assert(await inGroup(squad, vaultOwner.id), 'the admin is still in the squad');
  await expectError(() => rpc(vaultMember.jwt, 'add_group_admins', { p_group_id: P2gen, p_user_ids: [vaultMember.id] }), 'forbidden');
  await expectError(() => rpc(prober.jwt, 'add_group_admins', { p_group_id: squad, p_user_ids: [prober.id] }), 'forbidden');
});

await run('invitations into a private group still land, judged by the inviter', async () => {
  // accept_invitation judges the private squad by the INVITER while the invitee calls — the path a
  // naive "u must be the caller" rule would have broken. With invite_members OFF, so the inviter
  // gets in as the squad's ADMIN only: with it on, the squad creator would also pass the member
  // branch, and a rule that asked the caller-only is_group_admin would go unnoticed.
  await patch('community_permissions', `community_id=eq.${P2}`, { invite_members: false });
  try {
    await rpc(vaultOwner.jwt, 'invite_to_community', { p_community_id: P2, p_invitee_ids: [prober.id], p_group_ids: [P2gen, squad] });
    const [inv] = await sel('community_invitations', `community_id=eq.${P2}&invitee_id=eq.${prober.id}&select=id`);
    await rpc(prober.jwt, 'accept_invitation', { p_invitation_id: inv.id, p_ack: true });
    assert((await membership(P2, prober.id)) !== null && (await inGroup(squad, prober.id)), 'the invitee is in the community and the squad');
  } finally {
    await patch('community_permissions', `community_id=eq.${P2}`, { invite_members: true });
  }
  // invite_to_group (sent in the previous case) and the admin removing a member again.
  await rpc(vaultMember.jwt, 'accept_group_invitation', { p_group_id: squad, p_ack: true });
  assert(await inGroup(squad, vaultMember.id), 'invite_to_group into the squad works');
  await rpc(vaultOwner.jwt, 'remove_group_member', { p_group_id: squad, p_user_id: vaultMember.id });
  assert(!(await inGroup(squad, vaultMember.id)), 'remove_group_member still works for the admin');
});

// ── 6. invitations across a block ───────────────────────────────────────────────────────────────
const blkAdmin = await user('sg-blk-admin');
const blkFriend = await user('sg-blk-friend');
const blkBlocker = await user('sg-blk-blocker'); // has blocked the admin
const blkBlocked = await user('sg-blk-blocked'); // the admin has blocked them
const Blk = await rpc(blkAdmin.jwt, 'create_community_with_personal_tenant', communityArgs('Block Club', 'private'));
const BlkGen = await generalGroup(Blk);
const communityInvites = async (uid) =>
  (await sel('community_invitations', `community_id=eq.${Blk}&invitee_id=eq.${uid}&select=status`)).length;
const groupInvites = async (uid) =>
  (await sel('group_invitations', `group_id=eq.${BlkGen}&invitee_id=eq.${uid}&select=status`)).length;
await rpc(blkBlocker.jwt, 'block_user', { p_target: blkAdmin.id });
await rpc(blkAdmin.jwt, 'block_user', { p_target: blkBlocked.id });

await run('nobody is invited into a community across a block, either way — one blocked invitee refuses the whole list', async () => {
  await expectError(() => rpc(blkAdmin.jwt, 'invite_to_community', { p_community_id: Blk, p_invitee_ids: [blkBlocker.id] }), 'blocked');
  await expectError(() => rpc(blkAdmin.jwt, 'invite_to_community', { p_community_id: Blk, p_invitee_ids: [blkBlocked.id] }), 'blocked');
  // As invite_to_event does with its list: the friend first, then the blocker — nobody is invited.
  await expectError(() => rpc(blkAdmin.jwt, 'invite_to_community',
    { p_community_id: Blk, p_invitee_ids: [blkFriend.id, blkBlocker.id] }), 'blocked');
  for (const u of [blkBlocker, blkBlocked, blkFriend]) assert((await communityInvites(u.id)) === 0, `no invitation for ${u.id}`);
});

await run('nobody is invited into a group across a block, either way', async () => {
  await expectError(() => rpc(blkAdmin.jwt, 'invite_to_group', { p_group_id: BlkGen, p_invitee_id: blkBlocker.id }), 'blocked');
  await expectError(() => rpc(blkAdmin.jwt, 'invite_to_group', { p_group_id: BlkGen, p_invitee_id: blkBlocked.id }), 'blocked');
  assert((await groupInvites(blkBlocker.id)) === 0 && (await groupInvites(blkBlocked.id)) === 0, 'no group invitation');
});

await run('without a block, or once it is lifted, the same invitations go out', async () => {
  await rpc(blkAdmin.jwt, 'invite_to_community', { p_community_id: Blk, p_invitee_ids: [blkFriend.id] });
  await rpc(blkAdmin.jwt, 'invite_to_group', { p_group_id: BlkGen, p_invitee_id: blkFriend.id });
  assert((await communityInvites(blkFriend.id)) === 1 && (await groupInvites(blkFriend.id)) === 1, 'the friend is invited to both');
  await rpc(blkBlocker.jwt, 'unblock_user', { p_target: blkAdmin.id });
  await rpc(blkAdmin.jwt, 'unblock_user', { p_target: blkBlocked.id });
  await rpc(blkAdmin.jwt, 'invite_to_community', { p_community_id: Blk, p_invitee_ids: [blkBlocker.id, blkBlocked.id] });
  await rpc(blkAdmin.jwt, 'invite_to_group', { p_group_id: BlkGen, p_invitee_id: blkBlocker.id });
  assert((await communityInvites(blkBlocker.id)) === 1 && (await communityInvites(blkBlocked.id)) === 1,
    'both are invited to the community once unblocked');
  assert((await groupInvites(blkBlocker.id)) === 1, 'and to the group');
});
