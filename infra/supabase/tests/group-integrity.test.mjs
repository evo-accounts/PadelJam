// infra/supabase/tests/group-integrity.test.mjs
//
// Migration 0107 (UX Audit — Groups, plan PR 1), through PostgREST as the signed-in user — the path
// B1 and B2 were open on. group_integrity.sql covers the same ground in SQL; this is the copy CI runs.
import { user, rpc, req, sel, insert, patch, expectError, assert, run } from './lib.mjs';

/** Admin + community on Pro (so the group cap never interferes) + a public and a private group. */
async function setup(tag) {
  const admin = await user(`${tag}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Integrity ${tag} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const mk = (name, priv) => rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: name, p_description: null, p_is_private: priv, p_thumbnail_path: null,
  });
  return { admin, communityId, pub: await mk('Public', false), priv: await mk('Private', true) };
}

const members = (g) => sel('group_members', `group_id=eq.${g}&select=user_id`).then((r) => r.map((x) => x.user_id));

await run('B1: a community member cannot write themselves into a private group', async () => {
  const { communityId, priv } = await setup('b1');
  const bob = await user('b1-bob');
  await insert('community_members', { community_id: communityId, user_id: bob.id, role: 'member' });
  await expectError(
    () => req('/rest/v1/group_members', { method: 'POST', jwt: bob.jwt, body: { group_id: priv, user_id: bob.id } }),
    'row-level security',
  );
  assert(!(await members(priv)).includes(bob.id), 'bob is not in the private group');
});

await run('B2: deleting your own membership row directly does nothing', async () => {
  const { communityId, pub } = await setup('b2');
  const bob = await user('b2-bob');
  await insert('community_members', { community_id: communityId, user_id: bob.id, role: 'member' });
  await rpc(bob.jwt, 'join_group', { p_group_id: pub, p_ack: true });
  await req(`/rest/v1/group_members?group_id=eq.${pub}&user_id=eq.${bob.id}`, { method: 'DELETE', jwt: bob.jwt });
  assert((await members(pub)).includes(bob.id), 'the row survives a direct delete');
});

await run('B4: members invite only while invite_members is on', async () => {
  const { communityId, pub } = await setup('b4');
  const [bob, carol] = [await user('b4-bob'), await user('b4-carol')];
  await insert('community_members', { community_id: communityId, user_id: bob.id, role: 'member' });
  await rpc(bob.jwt, 'join_group', { p_group_id: pub, p_ack: true });

  await rpc(bob.jwt, 'invite_to_group', { p_group_id: pub, p_invitee_id: carol.id });
  await patch('community_permissions', `community_id=eq.${communityId}`, { invite_members: false });
  const dave = await user('b4-dave');
  await expectError(() => rpc(bob.jwt, 'invite_to_group', { p_group_id: pub, p_invitee_id: dave.id }), 'forbidden');
});

await run('B5: decline, then a re-invite is pending again and notifies again', async () => {
  const { admin, pub } = await setup('b5');
  const carol = await user('b5-carol');
  await rpc(admin.jwt, 'invite_to_group', { p_group_id: pub, p_invitee_id: carol.id });
  await rpc(carol.jwt, 'decline_group_invitation', { p_group_id: pub });
  let [inv] = await sel('group_invitations', `group_id=eq.${pub}&invitee_id=eq.${carol.id}&select=status`);
  assert(inv.status === 'declined', 'declined');

  await rpc(admin.jwt, 'invite_to_group', { p_group_id: pub, p_invitee_id: carol.id });
  [inv] = await sel('group_invitations', `group_id=eq.${pub}&invitee_id=eq.${carol.id}&select=status`);
  assert(inv.status === 'pending', 'pending again after a decline');
  const notes = await sel('notifications', `user_id=eq.${carol.id}&type=eq.group_invite&group_id=eq.${pub}&select=id`);
  assert(notes.length === 2, `two invite notifications, got ${notes.length}`);

  // Accept, leave, and be invited again.
  await rpc(carol.jwt, 'accept_group_invitation', { p_group_id: pub, p_ack: true });
  await rpc(carol.jwt, 'leave_group', { p_group_id: pub });
  await rpc(admin.jwt, 'invite_to_group', { p_group_id: pub, p_invitee_id: carol.id });
  [inv] = await sel('group_invitations', `group_id=eq.${pub}&invitee_id=eq.${carol.id}&select=status`);
  assert(inv.status === 'pending', 'pending again after leaving');
});

await run('leave preflight: private groups guard their last admin, public groups do not', async () => {
  const { admin, pub, priv } = await setup('lp');
  assert((await rpc(admin.jwt, 'leave_group_preflight', { p_group_id: priv })) === 'sole_admin', 'private blocks');
  await expectError(() => rpc(admin.jwt, 'leave_group', { p_group_id: priv }), 'sole_admin_must_add_another');
  assert((await rpc(admin.jwt, 'leave_group_preflight', { p_group_id: pub })) === 'ok', 'public never blocks');
  await rpc(admin.jwt, 'leave_group', { p_group_id: pub });
  assert((await rpc(admin.jwt, 'leave_group_preflight', { p_group_id: pub })) === 'not_a_member', 'after leaving');
});

await run('remove_group_member removes from the group only; members cannot use it', async () => {
  const { admin, communityId, pub } = await setup('rm');
  const [bob, carol] = [await user('rm-bob'), await user('rm-carol')];
  for (const u of [bob, carol]) {
    await insert('community_members', { community_id: communityId, user_id: u.id, role: 'member' });
    await rpc(u.jwt, 'join_group', { p_group_id: pub, p_ack: true });
  }
  await expectError(() => rpc(bob.jwt, 'remove_group_member', { p_group_id: pub, p_user_id: carol.id }), 'forbidden');
  await rpc(admin.jwt, 'remove_group_member', { p_group_id: pub, p_user_id: carol.id });
  assert(!(await members(pub)).includes(carol.id), 'carol left the group');
  const cm = await sel('community_members', `community_id=eq.${communityId}&user_id=eq.${carol.id}&select=user_id`);
  assert(cm.length === 1, 'carol is still in the community');
});

await run('B3: a new community opens season 1 on its general group', async () => {
  const { communityId } = await setup('b3');
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id,name`);
  assert(/ Group$/.test(general.name), `general group named "<name> Group", got "${general.name}"`);
  const seasons = await sel('group_seasons', `group_id=eq.${general.id}&ended_at=is.null&select=season_number`);
  assert(seasons.length === 1 && seasons[0].season_number === 1, 'one open season, number 1');
});
