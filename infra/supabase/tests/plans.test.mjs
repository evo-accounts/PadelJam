// infra/supabase/tests/plans.test.mjs
import { user, rpc, sel, insert, expectError, assert, run } from './lib.mjs';

const plan = (jwt) => rpc(jwt, 'account_plan_of_caller');
const cplan = (jwt, id) => rpc(jwt, 'community_plan', { c: id });

async function ownCommunity(owner, name) {
  return rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: name, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
}

await run('a user can grant and revoke Jammer+ for themselves', async () => {
  const u = await user('jp');
  assert((await plan(u.jwt)) === 'free', 'starts free');
  await rpc(u.jwt, 'set_account_plan', { p_plan: 'jammer_plus' });
  assert((await plan(u.jwt)) === 'jammer_plus', 'granted');
  const rows = await sel('subscriptions', `user_id=eq.${u.id}&select=plan_id,status,provider`);
  assert(rows.length === 1 && rows[0].plan_id === 'jammer_plus' && rows[0].status === 'active' && rows[0].provider === 'manual', 'manual row');
  await rpc(u.jwt, 'set_account_plan', { p_plan: 'jammer_plus' });   // idempotent
  assert((await sel('subscriptions', `user_id=eq.${u.id}&select=id`)).length === 1, 'still one row');
  await rpc(u.jwt, 'set_account_plan', { p_plan: 'free' });
  assert((await plan(u.jwt)) === 'free', 'revoked');
  await expectError(() => rpc(u.jwt, 'set_account_plan', { p_plan: 'club' }), 'invalid_plan');
});

await run('the owner can upgrade a community to Community Pro and back', async () => {
  const owner = await user('own');
  const member = await user('mem');
  const cid = await ownCommunity(owner, 'Plan Club');
  await rpc(member.jwt, 'join_community', { p_community_id: cid, p_ack: true });
  assert((await cplan(owner.jwt, cid)) === 'starter', 'starts on starter');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  assert((await cplan(owner.jwt, cid)) === 'community_pro', 'upgraded');
  await expectError(() => rpc(member.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' }), 'forbidden');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' });
  assert((await cplan(owner.jwt, cid)) === 'starter', 'downgraded');
});

await run('a downgrade is refused while the community exceeds Starter limits', async () => {
  const owner = await user('own2');
  const cid = await ownCommunity(owner, 'Big Club');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  await rpc(owner.jwt, 'create_group', { p_community_id: cid, p_name: 'Second', p_description: null, p_is_private: false, p_thumbnail_path: null });
  await expectError(() => rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' }), 'plan_downgrade_over_limit');
  await rpc(owner.jwt, 'archive_group', { p_group_id: (await sel('groups', `community_id=eq.${cid}&is_general=eq.false&select=id`))[0].id });
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' });
  assert((await cplan(owner.jwt, cid)) === 'starter', 'downgraded after archiving');
});
