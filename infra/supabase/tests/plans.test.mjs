// infra/supabase/tests/plans.test.mjs
import { user, rpc, sel, insert, patch, adminCreateUser, expectError, assert, run } from './lib.mjs';

const plan = (jwt) => rpc(jwt, 'account_plan_of_caller');
const cplan = (jwt, id) => rpc(jwt, 'community_plan', { c: id });

/** The caller becomes the community's creator and its first admin. */
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

  // ...and allowed once promoted: a PROMOTED admin, who did not create the community, can change
  // the plan. Basic allows 1 co-organizer, which is exactly what a second admin is.
  await rpc(creator.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  await patch('community_members', `community_id=eq.${cid}&user_id=eq.${promoted.id}`, { role: 'admin' });
  await rpc(promoted.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' });
  assert((await cplan(promoted.jwt, cid)) === 'basic', 'a promoted admin downgraded the plan');

  // Starter allows 3 co-organizers since 0156, so a second admin no longer blocks it.
  await rpc(promoted.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' });
  assert((await cplan(creator.jwt, cid)) === 'starter', 'Starter accepts a community with a co-organizer');
});

// 0156 pins a consequence the founder accepted for launch: Starter (250 / unlimited / unlimited / 3)
// is now LOOSER than Basic (50 / 3 / 5 / 1), so a Starter community that has used its room can be
// refused a move to Basic. Groups are covered by the Community Pro -> Basic test below.
await run('a Starter community with four groups is refused Basic', async () => {
  const owner = await user('starterBig');
  const cid = await ownCommunity(owner, 'Big Starter Club');
  for (const name of ['S2', 'S3', 'S4']) {
    await rpc(owner.jwt, 'create_group', { p_community_id: cid, p_name: name, p_description: null, p_is_private: false, p_thumbnail_path: null });
  }
  assert((await cplan(owner.jwt, cid)) === 'starter', 'still on starter');
  await expectError(() => rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' }), 'plan_downgrade_over_limit');
});

// Basic's members_per_community is 50: 51 members (the owner plus 50 joiners) is one over. The
// members are inserted as the service role; 50 sign-ups through the join RPC would be slow.
await run('a downgrade is refused while the community exceeds the Basic member cap', async () => {
  const owner = await user('memcap');
  const cid = await ownCommunity(owner, 'Crowded Club');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  const run = Date.now().toString(36);
  const ids = [];
  for (let b = 0; b < 5; b++) {
    ids.push(...await Promise.all(Array.from({ length: 10 }, (_, k) => {
      const n = b * 10 + k;
      return adminCreateUser(`memcap${n}-${run}@rpctest.local`, '+3519' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'));
    })));
  }
  await insert('profiles', ids.map((id, n) => ({
    id, email: `memcap${n}-${run}@rpctest.local`, phone: `+3519${String(70000000 + n)}`, full_name: `Crowd ${n}`, locale: 'en',
  })));
  await insert('community_members', ids.map((id) => ({ community_id: cid, user_id: id, role: 'member' })));
  assert((await sel('community_members', `community_id=eq.${cid}&select=user_id`)).length === 51, 'owner plus 50 members');
  await expectError(
    () => rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' }),
    'plan_downgrade_over_limit',
  );
  await rpc(owner.jwt, 'remove_member', { p_community_id: cid, p_user_id: ids[0] });
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' });
  assert((await cplan(owner.jwt, cid)) === 'basic', 'downgraded once back at the 50-member cap');
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

// An UPGRADE runs the same guard. Basic -> Community Pro must never refuse: Pro's limits are looser
// than whatever a Basic community is already within. (Starter -> Basic is NOT an upgrade in limits
// any more: see the four-groups test above.)
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

// 0104: the two limits that were unchecked until now.
await run('a downgrade is refused while the community has more co-organizers than the plan allows', async () => {
  const creator = await user('coOrgGuard');
  const second = await user('coOrgGuard2');
  const cid = await ownCommunity(creator, 'Co-organizer Club');
  await rpc(second.jwt, 'join_community', { p_community_id: cid, p_ack: true });

  // Community Pro allows 3 co-organizers, so the promotion is legal there.
  await rpc(creator.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  await patch('community_members', `community_id=eq.${cid}&user_id=eq.${second.id}`, { role: 'admin' });

  // Basic allows 1 co-organizer and there is exactly 1 (two admins minus the creator), so Basic
  // is fine — the guard must not be off by one.
  await rpc(creator.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' });
  assert((await cplan(creator.jwt, cid)) === 'basic', 'one co-organizer fits Basic');

  // Basic is tighter than Starter now, so a second co-organizer is refused on Basic until demoted.
  const third = await user('coOrgGuard3');
  await rpc(third.jwt, 'join_community', { p_community_id: cid, p_ack: true });
  await rpc(creator.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  await patch('community_members', `community_id=eq.${cid}&user_id=eq.${third.id}`, { role: 'admin' });
  await expectError(
    () => rpc(creator.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' }),
    'plan_downgrade_over_limit',
  );
  await patch('community_members', `community_id=eq.${cid}&user_id=eq.${third.id}`, { role: 'member' });
  await rpc(creator.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' });
  assert((await cplan(creator.jwt, cid)) === 'basic', 'accepted once the extra co-organizer is gone');
});

await run('a sole-admin community is never blocked by the co-organizer guard', async () => {
  // The creator holds the first admin slot, so co-organizers is admins MINUS ONE. If that minus
  // one were missing, a lone creator would count as a co-organizer and every community would sit
  // one over the limit; a lone creator must always pass.
  const owner = await user('soleAdmin');
  const cid = await ownCommunity(owner, 'Sole Admin Club');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'basic' });
  assert((await cplan(owner.jwt, cid)) === 'basic', 'a lone creator downgrades to Basic');
});

// Acceptance 4 for 0156: the paid plans' limits did not move.
await run('Basic and Community Pro limits are unchanged by the Starter launch limits', async () => {
  const rows = await sel('plan_limits', 'plan_id=in.(basic,community_pro)&select=plan_id,limit_key,value');
  const have = Object.fromEntries(rows.map((r) => [`${r.plan_id}/${r.limit_key}`, r.value]));
  const want = {
    'basic/members_per_community': 50, 'basic/groups_per_community': 3, 'basic/recurring_events': 5, 'basic/co_organizers': 1,
    'community_pro/members_per_community': 250, 'community_pro/groups_per_community': null,
    'community_pro/recurring_events': null, 'community_pro/co_organizers': 3,
  };
  for (const [k, v] of Object.entries(want)) assert(k in have && have[k] === v, `${k} should be ${v}, got ${have[k]}`);
});
