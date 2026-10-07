// infra/supabase/tests/community-membership-writes.test.mjs
// Migration 0135: nobody writes their own way into a community or group. Each "cannot" below was
// a working exploit before 0135 — an outsider joining somebody else's PRIVATE community, making
// themselves its admin, smuggling themselves into a private group through an invitation, moving a
// group into another community, or an approver accepting a request nobody made. Each "can" is the
// legitimate path that must keep working beside it.
import { user, rpc, req, sel, insert, expectError, assert, run } from './lib.mjs';

const communityArgs = (name, privacy) => ({
  p_name: name, p_type: 'club', p_country: 'PT', p_privacy: privacy,
  p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
  p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
});
const DENIED = 'permission denied';

const owner = await user('cmw-owner');
const outsider = await user('cmw-outsider');
const member = await user('cmw-member');
const bystander = await user('cmw-bystander');
const requester = await user('cmw-requester');
const host = await user('cmw-host');
const late = await user('cmw-late');

// The victim: a private community on a plan with room for more groups, its general group, a
// private squad and an open group — plus a request-to-join community.
const P = await rpc(owner.jwt, 'create_community_with_personal_tenant', communityArgs('Membership Vault', 'private'));
await insert('community_subscriptions', { community_id: P, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
const [{ id: Pgeneral }] = await sel('groups', `community_id=eq.${P}&is_general=eq.true&select=id`);
const squad = await rpc(owner.jwt, 'create_group', { p_community_id: P, p_name: 'Squad', p_is_private: true });
const open = await rpc(owner.jwt, 'create_group', { p_community_id: P, p_name: 'Open', p_is_private: false });
const R = await rpc(owner.jwt, 'create_community_with_personal_tenant', communityArgs('Membership Queue', 'request_to_join'));
const [{ id: Rgeneral }] = await sel('groups', `community_id=eq.${R}&is_general=eq.true&select=id`);
// The outsider's own public community, which makes them an admin somewhere.
const O = await rpc(outsider.jwt, 'create_community_with_personal_tenant', communityArgs('Outsider Club', 'public'));
const [{ id: Ogeneral }] = await sel('groups', `community_id=eq.${O}&is_general=eq.true&select=id`);
// An ordinary member of P, invited in properly (new communities let members invite by default).
await rpc(owner.jwt, 'invite_to_community', { p_community_id: P, p_invitee_ids: [member.id] });
const [mInv] = await sel('community_invitations', `community_id=eq.${P}&invitee_id=eq.${member.id}&select=id`);
await rpc(member.jwt, 'accept_invitation', { p_invitation_id: mInv.id, p_ack: true });

const membership = async (cid, uid) =>
  (await sel('community_members', `community_id=eq.${cid}&user_id=eq.${uid}&select=role`))[0] ?? null;
const inGroup = async (gid, uid) =>
  (await sel('group_members', `group_id=eq.${gid}&user_id=eq.${uid}&select=user_id`)).length === 1;

// ── cannot ──────────────────────────────────────────────────────────────────────────────────────

await run('an outsider cannot insert their own membership row', async () => {
  await expectError(
    () => req('/rest/v1/community_members', { method: 'POST', jwt: outsider.jwt, body: { community_id: P, user_id: outsider.id } }),
    DENIED,
  );
  assert((await membership(P, outsider.id)) === null, 'still not a member');
});

await run('an outsider cannot join a private or request-to-join community through one of its groups', async () => {
  await expectError(() => rpc(outsider.jwt, 'join_group', { p_group_id: Pgeneral }), 'forbidden');
  await expectError(() => rpc(outsider.jwt, 'join_group', { p_group_id: Rgeneral }), 'forbidden');
  assert((await membership(P, outsider.id)) === null && (await membership(R, outsider.id)) === null, 'in neither');
});

await run("an outsider cannot invite themselves into another community's group", async () => {
  await expectError(
    () => rpc(outsider.jwt, 'invite_to_community', { p_community_id: O, p_invitee_ids: [outsider.id], p_group_ids: [Pgeneral] }),
    'forbidden',
  );
});

await run('a member cannot invite anyone into a private group they are not in', async () => {
  await expectError(
    () => rpc(member.jwt, 'invite_to_community', { p_community_id: P, p_invitee_ids: [bystander.id], p_group_ids: [squad] }),
    'forbidden',
  );
});

await run('nobody writes invitations directly', async () => {
  await expectError(
    () => req('/rest/v1/community_invitations', {
      method: 'POST', jwt: outsider.jwt, body: { community_id: O, inviter_id: outsider.id, invitee_id: outsider.id, group_ids: [Pgeneral] },
    }),
    DENIED,
  );
});

await run('a group cannot be moved into another community, or created around create_group', async () => {
  await expectError(
    () => req(`/rest/v1/groups?id=eq.${Ogeneral}`, { method: 'PATCH', jwt: outsider.jwt, body: { community_id: P } }),
    DENIED,
  );
  await expectError(
    () => req('/rest/v1/groups', { method: 'POST', jwt: outsider.jwt, body: { community_id: O, name: 'Trojan' } }),
    DENIED,
  );
  const [{ community_id }] = await sel('groups', `id=eq.${Ogeneral}&select=community_id`);
  assert(community_id === O, 'the group stayed where it was');
});

await run('a member cannot leave around leave_community, keeping their groups', async () => {
  await expectError(
    () => req(`/rest/v1/community_members?community_id=eq.${P}&user_id=eq.${member.id}`, { method: 'DELETE', jwt: member.jwt }),
    DENIED,
  );
});

await run('join requests are not written directly, and only a pending one can be accepted', async () => {
  await expectError(
    () => req('/rest/v1/community_join_requests', {
      method: 'POST', jwt: outsider.jwt, body: { community_id: P, user_id: outsider.id, status: 'accepted' },
    }),
    DENIED,
  );
  assert((await rpc(requester.jwt, 'join_community', { p_community_id: R, p_ack: true })) === 'requested', 'requested');
  const [request] = await sel('community_join_requests', `community_id=eq.${R}&user_id=eq.${requester.id}&select=id`);
  // The approver cannot point the request at somebody who never asked.
  await expectError(
    () => req(`/rest/v1/community_join_requests?id=eq.${request.id}`, { method: 'PATCH', jwt: owner.jwt, body: { user_id: bystander.id } }),
    DENIED,
  );
  // Nor accept it once its owner has withdrawn it.
  await rpc(requester.jwt, 'cancel_join_request', { p_community_id: R });
  await expectError(() => rpc(owner.jwt, 'accept_join_request', { p_request_id: request.id }), 'request_not_found');
  assert((await membership(R, requester.id)) === null, 'the requester who cancelled is not a member');
});

await run('a member cannot promote themselves', async () => {
  const rows = await req(`/rest/v1/community_members?community_id=eq.${P}&user_id=eq.${member.id}`, {
    method: 'PATCH', jwt: member.jwt, body: { role: 'admin' }, prefer: 'return=representation',
  });
  assert(Array.isArray(rows) && rows.length === 0, `the policy matched no row, got ${JSON.stringify(rows)}`);
  assert((await membership(P, member.id)).role === 'member', 'still a member, not an admin');
});

await run("an invitation written before 0135 cannot be cashed in for another community's group", async () => {
  // Planted with the service key, standing in for one an exploit left behind.
  const H = await rpc(host.jwt, 'create_community_with_personal_tenant', communityArgs('Host Club', 'public'));
  const [planted] = await insert('community_invitations', { community_id: H, inviter_id: host.id, invitee_id: late.id, group_ids: [squad] });
  await rpc(late.jwt, 'accept_invitation', { p_invitation_id: planted.id, p_ack: true });
  assert((await membership(H, late.id))?.role === 'member', 'joins the community the invitation is for');
  assert(!(await inGroup(squad, late.id)), "but not the other community's private group");
});

// ── can ─────────────────────────────────────────────────────────────────────────────────────────

await run('a real invitation still brings the invitee into the community and the private group it names', async () => {
  await rpc(owner.jwt, 'invite_to_community', { p_community_id: P, p_invitee_ids: [outsider.id], p_group_ids: [squad] });
  const [inv] = await sel('community_invitations', `community_id=eq.${P}&invitee_id=eq.${outsider.id}&select=id`);
  // The invitee cannot rewrite it on the way.
  await expectError(
    () => req(`/rest/v1/community_invitations?id=eq.${inv.id}`, { method: 'PATCH', jwt: outsider.jwt, body: { community_id: O } }),
    DENIED,
  );
  await rpc(outsider.jwt, 'accept_invitation', { p_invitation_id: inv.id, p_ack: true });
  assert((await membership(P, outsider.id))?.role === 'member', 'a member of the community');
  assert(await inGroup(squad, outsider.id), 'and of the private squad the owner invited them into');
});

await run('an admin can still promote and demote, and change nothing but the role', async () => {
  const path = `/rest/v1/community_members?community_id=eq.${P}&user_id=eq.${outsider.id}`;
  const up = await req(path, { method: 'PATCH', jwt: owner.jwt, body: { role: 'admin' }, prefer: 'return=representation' });
  assert(up.length === 1 && up[0].role === 'admin', `promoted, got ${JSON.stringify(up)}`);
  const down = await req(path, { method: 'PATCH', jwt: owner.jwt, body: { role: 'member' }, prefer: 'return=representation' });
  assert(down.length === 1 && down[0].role === 'member', `demoted, got ${JSON.stringify(down)}`);
  await expectError(() => req(path, { method: 'PATCH', jwt: owner.jwt, body: { community_id: O } }), DENIED);
});

await run('a group admin can still edit their group', async () => {
  const rows = await req(`/rest/v1/groups?id=eq.${squad}`, {
    method: 'PATCH', jwt: owner.jwt, body: { name: 'Squad Renamed', description: 'Tuesdays', thumbnail_path: null }, prefer: 'return=representation',
  });
  assert(rows.length === 1 && rows[0].name === 'Squad Renamed', `edited, got ${JSON.stringify(rows)}`);
});

await run('a member can still join an open group inside their private community', async () => {
  await rpc(member.jwt, 'join_group', { p_group_id: open });
  assert(await inGroup(open, member.id), 'GR-07: a community member joins a public group directly');
});

await run('a fresh request can still be accepted', async () => {
  assert((await rpc(requester.jwt, 'join_community', { p_community_id: R, p_ack: true })) === 'requested', 'requested again');
  const [pending] = await sel('community_join_requests', `community_id=eq.${R}&user_id=eq.${requester.id}&status=eq.pending&select=id`);
  await rpc(owner.jwt, 'accept_join_request', { p_request_id: pending.id });
  assert((await membership(R, requester.id))?.role === 'member', 'accepted into the request-to-join community');
});

await run('an archived group can be neither joined nor invited into', async () => {
  await rpc(owner.jwt, 'archive_group', { p_group_id: open });
  await expectError(() => rpc(outsider.jwt, 'join_group', { p_group_id: open }), 'forbidden');
  await expectError(
    () => rpc(owner.jwt, 'invite_to_community', { p_community_id: P, p_invitee_ids: [bystander.id], p_group_ids: [open] }),
    'forbidden',
  );
});
