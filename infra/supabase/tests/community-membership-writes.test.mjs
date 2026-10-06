// infra/supabase/tests/community-membership-writes.test.mjs
// Migration 0135: nobody writes their own way into a community or group. Each "cannot" below was
// a working exploit before 0135 — an outsider joining somebody else's PRIVATE community, making
// themselves its admin, or slipping into its private group through an invitation they wrote
// themselves. Each "can" is the legitimate path that must keep working beside it.
import { user, rpc, req, sel, insert, del, expectError, assert, run } from './lib.mjs';

const communityArgs = (name, privacy) => ({
  p_name: name, p_type: 'club', p_country: 'PT', p_privacy: privacy,
  p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
  p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
});

const owner = await user('cmw-owner');
const outsider = await user('cmw-outsider');
const host = await user('cmw-host');
const late = await user('cmw-late');

// The victim: a private community and its general group.
const P = await rpc(owner.jwt, 'create_community_with_personal_tenant', communityArgs('Membership Vault', 'private'));
const [{ id: Pgroup }] = await sel('groups', `community_id=eq.${P}&select=id&limit=1`);
// The outsider's own public community, which gives them invite rights somewhere.
const O = await rpc(outsider.jwt, 'create_community_with_personal_tenant', communityArgs('Outsider Club', 'public'));

const membership = async (cid, uid) =>
  (await sel('community_members', `community_id=eq.${cid}&user_id=eq.${uid}&select=role`))[0] ?? null;
const inGroup = async (gid, uid) =>
  (await sel('group_members', `group_id=eq.${gid}&user_id=eq.${uid}&select=user_id`)).length === 1;

await run('an outsider cannot insert their own membership row', async () => {
  await expectError(
    () => req('/rest/v1/community_members', {
      method: 'POST', jwt: outsider.jwt, body: { community_id: P, user_id: outsider.id },
    }),
    'permission denied',
  );
  assert((await membership(P, outsider.id)) === null, 'still not a member');
});

await run("an outsider cannot join a private community through one of its groups", async () => {
  await expectError(() => rpc(outsider.jwt, 'join_group', { p_group_id: Pgroup }), 'forbidden');
  assert((await membership(P, outsider.id)) === null, 'join_group did not make them a member');
});

await run("an outsider cannot invite themselves into another community's group", async () => {
  await expectError(
    () => rpc(outsider.jwt, 'invite_to_community', {
      p_community_id: O, p_invitee_ids: [outsider.id], p_group_ids: [Pgroup],
    }),
    'forbidden',
  );
});

await run('nobody writes invitations directly', async () => {
  await expectError(
    () => req('/rest/v1/community_invitations', {
      method: 'POST', jwt: outsider.jwt,
      body: { community_id: O, inviter_id: outsider.id, invitee_id: outsider.id, group_ids: [Pgroup] },
    }),
    'permission denied',
  );
});

await run('a real invitation still gets the invitee into the community and its group', async () => {
  await rpc(owner.jwt, 'invite_to_community', { p_community_id: P, p_invitee_ids: [outsider.id], p_group_ids: [Pgroup] });
  const [inv] = await sel('community_invitations', `community_id=eq.${P}&invitee_id=eq.${outsider.id}&select=id`);
  // The invitee cannot rewrite it on the way: the update is refused outright.
  await expectError(
    () => req(`/rest/v1/community_invitations?id=eq.${inv.id}`, {
      method: 'PATCH', jwt: outsider.jwt, body: { community_id: O },
    }),
    'permission denied',
  );
  await rpc(outsider.jwt, 'accept_invitation', { p_invitation_id: inv.id, p_ack: true });
  assert((await membership(P, outsider.id))?.role === 'member', 'a member of the community');
  assert(await inGroup(Pgroup, outsider.id), 'and of the group the invitation named');
});

await run('a member cannot promote themselves', async () => {
  const rows = await req(`/rest/v1/community_members?community_id=eq.${P}&user_id=eq.${outsider.id}`, {
    method: 'PATCH', jwt: outsider.jwt, body: { role: 'admin' }, prefer: 'return=representation',
  });
  assert(Array.isArray(rows) && rows.length === 0, `the policy matched no row, got ${JSON.stringify(rows)}`);
  assert((await membership(P, outsider.id)).role === 'member', 'still a member, not an admin');
});

await run('an admin can still change a role, and only the role', async () => {
  // A no-op value keeps the plan's co-organizer cap out of the way; the point is that the write is
  // allowed at all (Make admin / Remove admin in the app are exactly this request).
  const rows = await req(`/rest/v1/community_members?community_id=eq.${P}&user_id=eq.${outsider.id}`, {
    method: 'PATCH', jwt: owner.jwt, body: { role: 'member' }, prefer: 'return=representation',
  });
  assert(Array.isArray(rows) && rows.length === 1, `the admin's update went through, got ${JSON.stringify(rows)}`);
  await expectError(
    () => req(`/rest/v1/community_members?community_id=eq.${P}&user_id=eq.${outsider.id}`, {
      method: 'PATCH', jwt: owner.jwt, body: { community_id: O },
    }),
    'permission denied',
  );
});

await run("an invitation written before 0135 cannot be cashed in for another community's group", async () => {
  // The bad row is planted with the service key, standing in for one an exploit left behind.
  const H = await rpc(host.jwt, 'create_community_with_personal_tenant', communityArgs('Host Club', 'public'));
  const [planted] = await insert('community_invitations', {
    community_id: H, inviter_id: host.id, invitee_id: late.id, group_ids: [Pgroup],
  });
  await rpc(late.jwt, 'accept_invitation', { p_invitation_id: planted.id, p_ack: true });
  assert((await membership(H, late.id))?.role === 'member', 'joins the community the invitation is for');
  assert(!(await inGroup(Pgroup, late.id)), "but not the other community's private group");
});

await run('a member can still join an open group inside their private community', async () => {
  // The general group is open, and a starter community may hold only that one group, so the member
  // is taken out of it (service key) and walks back in through join_group as a community member.
  const [{ is_private }] = await sel('groups', `id=eq.${Pgroup}&select=is_private`);
  assert(is_private === false, 'the general group is an open group');
  await del('group_members', `group_id=eq.${Pgroup}&user_id=eq.${outsider.id}`);
  assert(!(await inGroup(Pgroup, outsider.id)), 'out of the group, still in the community');
  await rpc(outsider.jwt, 'join_group', { p_group_id: Pgroup });
  assert(await inGroup(Pgroup, outsider.id), 'GR-07: a community member joins a public group directly');
});
