// infra/supabase/tests/plans.test.mjs
import { user, rpc, sel, patch, expectError, assert, run } from './lib.mjs';

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

await run('an admin can upgrade a community to Community Pro and back; a member cannot', async () => {
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

// set_community_plan required role = 'owner' until migration 0098. With two roles it accepts any
// admin, so a PROMOTED admin — who did not create the community — must be able to change the plan.
await run('any admin can set the plan, not only the community creator', async () => {
  const creator = await user('planCreator');
  const promoted = await user('planPromoted');
  const cid = await ownCommunity(creator, 'Promoted Admin Club');
  await rpc(promoted.jwt, 'join_community', { p_community_id: cid, p_ack: true });

  // Refused while they are a plain member...
  await expectError(() => rpc(promoted.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' }), 'forbidden');

  // ...and allowed once promoted. Community Pro first, because Starter's co_organizers limit of 0
  // means "one admin, no co-organizers" and the creator already holds that slot.
  await rpc(creator.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  await patch('community_members', `community_id=eq.${cid}&user_id=eq.${promoted.id}`, { role: 'admin' });
  await rpc(promoted.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' });
  assert((await cplan(promoted.jwt, cid)) === 'starter', 'a promoted admin downgraded the plan');
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

// Starter's members_per_community seed value (0013) is 10 — small enough to hit directly:
// 11 members (the owner plus 10 joiners) is one over the cap.
await run('a downgrade is refused while the community exceeds the Starter member cap', async () => {
  const owner = await user('memcap');
  const cid = await ownCommunity(owner, 'Crowded Club');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  const joiners = [];
  for (let i = 0; i < 10; i++) {
    const m = await user(`memcap${i}`);
    await rpc(m.jwt, 'join_community', { p_community_id: cid, p_ack: true });
    joiners.push(m);
  }
  assert(
    (await sel('community_members', `community_id=eq.${cid}&select=user_id`)).length === 11,
    'owner plus 10 joiners',
  );
  await expectError(
    () => rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' }),
    'plan_downgrade_over_limit',
  );
  await rpc(owner.jwt, 'remove_member', { p_community_id: cid, p_user_id: joiners[0].id });
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' });
  assert((await cplan(owner.jwt, cid)) === 'starter', 'downgraded once back at the 10-member cap');
});

// ---------------------------------------------------------------------------
// 0103: the middle tier, and the guard that only ever ran for Starter.
// ---------------------------------------------------------------------------

await run('a community can be set to Basic, and Basic bundles Jammer+ for its creator', async () => {
  const owner = await user('basicOwner');
  const cid = await ownCommunity(owner, 'Basic Club');
  assert((await plan(owner.jwt)) === 'free', 'creator starts free');

  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' });
  assert((await cplan(owner.jwt, cid)) === 'basic', 'set to basic');

  const rows = await sel('community_subscriptions', `community_id=eq.${cid}&select=plan_id,status,provider`);
  assert(rows.length === 1 && rows[0].plan_id === 'basic' && rows[0].provider === 'manual', 'one manual basic row');

  // plan_features has carried ('community','basic','jammer_plus_included') since 0013, and
  // account_plan reads it through communities.created_by. Nothing in 0103 grants this directly.
  assert((await plan(owner.jwt)) === 'jammer_plus', 'basic bundles Jammer+ for the creator');

  // Idempotent, and reversible.
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' });
  assert((await sel('community_subscriptions', `community_id=eq.${cid}&select=id`)).length === 1, 'still one row');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' });
  assert((await cplan(owner.jwt, cid)) === 'starter', 'back to starter');
  assert((await plan(owner.jwt)) === 'free', 'and the bundled Jammer+ goes with it');
});

// The reason 0103 had to move the guard out of the `p_plan = 'starter'` branch. Community Pro
// allows unlimited groups and Basic allows 3, so this downgrade is over a limit — and before 0103
// no limit check ran for it at all, because the guard was unreachable for any non-Starter target.
await run('a Community Pro -> Basic downgrade is refused while over Basic group limits', async () => {
  const owner = await user('proToBasic');
  const cid = await ownCommunity(owner, 'Groupy Club');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });

  // The general group is created with the community, so three more puts it at four.
  for (const name of ['G2', 'G3', 'G4']) {
    await rpc(owner.jwt, 'create_group', {
      p_community_id: cid, p_name: name, p_description: null, p_is_private: false, p_thumbnail_path: null,
    });
  }
  const groups = await sel('groups', `community_id=eq.${cid}&archived_at=is.null&select=id,is_general`);
  assert(groups.length === 4, `four live groups, got ${groups.length}`);

  await expectError(
    () => rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' }),
    'plan_downgrade_over_limit',
  );

  await rpc(owner.jwt, 'archive_group', { p_group_id: groups.find((g) => !g.is_general).id });
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' });
  assert((await cplan(owner.jwt, cid)) === 'basic', 'accepted once back within Basic limits');
});

// An UPGRADE runs the same guard now. It must never refuse: the target's limits are looser than
// whatever the community is already within.
await run('an upgrade is never refused by the limit guard', async () => {
  const owner = await user('upgradeGuard');
  const cid = await ownCommunity(owner, 'Upgrade Club');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' });
  for (const name of ['U2', 'U3']) {
    await rpc(owner.jwt, 'create_group', {
      p_community_id: cid, p_name: name, p_description: null, p_is_private: false, p_thumbnail_path: null,
    });
  }
  // At Basic's cap of 3 groups; Community Pro is unlimited.
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  assert((await cplan(owner.jwt, cid)) === 'community_pro', 'upgraded while at the lower cap');
});

await run('club is still not settable from the app', async () => {
  const owner = await user('clubTry');
  const cid = await ownCommunity(owner, 'Club Try');
  await expectError(() => rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'club' }), 'invalid_plan');
});
