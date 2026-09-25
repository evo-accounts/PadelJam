// infra/supabase/tests/group-departures.test.mjs
//
// Migration 0108 (UX Audit — Groups, plan PR 2) through PostgREST. group_departures_archive.sql
// covers the same ground in SQL; this is the copy CI runs.
import { user, rpc, sel, insert, expectError, assert, run } from './lib.mjs';

async function setup(tag) {
  const admin = await user(`${tag}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Departures ${tag} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const groupId = await rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Tuesday', p_description: 'Evenings', p_is_private: false, p_thumbnail_path: null,
  });
  return { admin, communityId, groupId };
}

await run('leaving keeps you in the member list as departed; rejoining restores you', async () => {
  const { admin, communityId, groupId } = await setup('dep');
  const bob = await user('dep-bob');
  await insert('community_members', { community_id: communityId, user_id: bob.id, role: 'member' });
  await rpc(bob.jwt, 'join_group', { p_group_id: groupId, p_ack: true });
  await rpc(bob.jwt, 'leave_group', { p_group_id: groupId });

  let list = await rpc(admin.jwt, 'group_member_list', { p_group_id: groupId });
  const gone = list.find((r) => r.user_id === bob.id);
  assert(gone && gone.is_member === false && gone.left_at, 'bob listed as departed');
  assert(list[0].is_member, 'current members come first');

  await rpc(bob.jwt, 'join_group', { p_group_id: groupId, p_ack: true });
  list = await rpc(admin.jwt, 'group_member_list', { p_group_id: groupId });
  assert(list.find((r) => r.user_id === bob.id)?.is_member === true, 'bob is a member again');
});

await run('a stranger to the community cannot read the member list', async () => {
  const { groupId } = await setup('str');
  const eve = await user('str-eve');
  await expectError(() => rpc(eve.jwt, 'group_member_list', { p_group_id: groupId }), 'forbidden');
});

await run('archiving refuses the last active group, whichever it is', async () => {
  const { admin, communityId, groupId } = await setup('last');
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  await rpc(admin.jwt, 'archive_group', { p_group_id: general.id });  // Tuesday is still active
  await expectError(() => rpc(admin.jwt, 'archive_group', { p_group_id: groupId }), 'last_active_group');
});

await run('my_groups shows archived groups to their admin only on request, with card fields', async () => {
  const { admin, communityId, groupId } = await setup('mg');
  await rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Spare', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });
  await rpc(admin.jwt, 'archive_group', { p_group_id: groupId });
  const plain = await rpc(admin.jwt, 'my_groups');
  assert(!plain.some((g) => g.group_id === groupId), 'hidden by default');
  const withArchived = await rpc(admin.jwt, 'my_groups', { p_include_archived: true });
  const row = withArchived.find((g) => g.group_id === groupId);
  assert(row && row.archived_at && row.description === 'Evenings' && row.is_private === false, 'archived row with card fields');
});
