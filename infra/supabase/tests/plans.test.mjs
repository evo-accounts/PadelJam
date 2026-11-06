// infra/supabase/tests/plans.test.mjs
import { user, rpc, anonRpc, sel, expectError, assert, run, setAccountPlan, setCommunityPlan } from './lib.mjs';

const plan = (jwt) => rpc(jwt, 'account_plan_of_caller');
const cplan = (jwt, id) => rpc(jwt, 'community_plan', { c: id });

/** The caller becomes the community's creator and its first (and, on Starter, only) admin. */
async function ownCommunity(owner, name) {
  return rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: name, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
}

// 0151: a plan is written only by the service role. Hiding the screens is not enough.
await run('a signed-in user cannot grant themself a plan, for the account or a community they admin', async () => {
  const u = await user('selfGrant');
  const cid = await ownCommunity(u, 'Self Grant Club');
  await expectError(() => rpc(u.jwt, 'set_account_plan', { p_plan: 'jammer_plus' }), 'permission denied for function');
  await expectError(() => rpc(u.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' }), 'permission denied for function');
  assert((await plan(u.jwt)) === 'free', 'account plan unchanged');
  assert((await cplan(u.jwt, cid)) === 'starter', 'community plan unchanged');
  assert((await sel('subscriptions', `user_id=eq.${u.id}&select=id`)).length === 0, 'no subscription row');
});

await run('anon cannot call the plan writers either', async () => {
  await expectError(() => anonRpc('set_account_plan', { p_plan: 'jammer_plus' }), 'permission denied for function');
  await expectError(() => anonRpc('set_community_plan', { p_community_id: '00000000-0000-0000-0000-000000000000', p_plan: 'community_pro' }), 'permission denied for function');
});

await run('a service-written account plan is read back, and free clears it', async () => {
  const u = await user('jp');
  assert((await plan(u.jwt)) === 'free', 'starts free');
  await setAccountPlan(u.id, 'jammer_plus');
  assert((await plan(u.jwt)) === 'jammer_plus', 'granted');
  await setAccountPlan(u.id, 'free');
  assert((await plan(u.jwt)) === 'free', 'cleared');
});

await run('a community can be set to Basic, and Basic bundles Jammer+ for its creator', async () => {
  const owner = await user('basicOwner');
  const cid = await ownCommunity(owner, 'Basic Club');
  assert((await plan(owner.jwt)) === 'free', 'creator starts free');
  await setCommunityPlan(cid, 'basic');
  assert((await cplan(owner.jwt, cid)) === 'basic', 'set to basic');
  // plan_features carries ('community','basic','jammer_plus_included'); account_plan reads it
  // through communities.created_by.
  assert((await plan(owner.jwt)) === 'jammer_plus', 'basic bundles Jammer+ for the creator');
  await setCommunityPlan(cid, 'starter');
  assert((await cplan(owner.jwt, cid)) === 'starter', 'back to starter');
  assert((await plan(owner.jwt)) === 'free', 'and the bundled Jammer+ goes with it');
});
