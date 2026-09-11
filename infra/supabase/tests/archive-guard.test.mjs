// infra/supabase/tests/archive-guard.test.mjs
import { user, rpc, sel, expectError, assert, run, insert } from './lib.mjs';

await run('general group cannot be archived while it is the only group', async () => {
  const owner = await user('owner');
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Guard Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  assert(general, 'general group exists');

  await expectError(() => rpc(owner.jwt, 'archive_group', { p_group_id: general.id }), 'general_group_only_group');

  const stillActive = await sel('groups', `id=eq.${general.id}&select=archived_at`);
  assert(stillActive[0].archived_at === null, 'general group is still active');
});

await run('general group can be archived once another active group exists', async () => {
  const owner = await user('owner2');
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Guard Club Two', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  // Starter allows one group; Basic lifts the cap so a second group can exist (same trick as seed-e2e.mjs).
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  await rpc(owner.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Second', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });
  await rpc(owner.jwt, 'archive_group', { p_group_id: general.id });
  const archived = await sel('groups', `id=eq.${general.id}&select=archived_at`);
  assert(archived[0].archived_at !== null, 'general group archived');
});

await run('an archived sibling does not count as another group', async () => {
  const owner = await user('owner3');
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Guard Club Three', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  // Starter allows one group; Basic lifts the cap so a second group can exist (same trick as seed-e2e.mjs).
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  const second = await rpc(owner.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Second', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });
  await rpc(owner.jwt, 'archive_group', { p_group_id: second });
  await expectError(() => rpc(owner.jwt, 'archive_group', { p_group_id: general.id }), 'general_group_only_group');
});
