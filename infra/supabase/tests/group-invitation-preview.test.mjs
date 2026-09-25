// infra/supabase/tests/group-invitation-preview.test.mjs
//
// Migration 0110 (UX-GRP-02) through PostgREST: the invitee of a PRIVATE group — who cannot read
// the group row itself — sees its identity and who invited them; nobody else sees anything.
// group_invitation_preview.sql covers the same ground in SQL; this is the copy CI runs.
import { user, rpc, sel, insert, assert, run } from './lib.mjs';

await run('an invitee previews a private group; a stranger gets nothing', async () => {
  const admin = await user('gip-admin');
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Preview ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const groupId = await rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Hidden', p_description: 'Hush', p_is_private: true, p_thumbnail_path: null,
  });
  const [bob, eve] = [await user('gip-bob'), await user('gip-eve')];
  await rpc(admin.jwt, 'invite_to_group', { p_group_id: groupId, p_invitee_id: bob.id });

  const [row] = await rpc(bob.jwt, 'group_invitation_preview', { p_group_id: groupId });
  assert(row && row.name === 'Hidden' && row.member_count === 1 && row.inviter_id === admin.id, 'bob sees the preview');
  assert((await rpc(eve.jwt, 'group_invitation_preview', { p_group_id: groupId })).length === 0, 'eve sees nothing');

  await rpc(bob.jwt, 'accept_group_invitation', { p_group_id: groupId, p_ack: true });
  assert((await rpc(bob.jwt, 'group_invitation_preview', { p_group_id: groupId })).length === 0, 'accepting ends it');
  const members = await sel('group_members', `group_id=eq.${groupId}&user_id=eq.${bob.id}&select=user_id`);
  assert(members.length === 1, 'bob is in');
});
