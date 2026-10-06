// infra/supabase/tests/explore-viewer-state.test.mjs
//
// Migration 0128 — explore viewer state, follow RPCs and community geo (UX Audit — Home & Explore,
// decisions D2, D8, D9 and bug B4).
//
// Every call goes through PostgREST with a real user's JWT. The explore functions are `security
// definer`, so the predicates inside them are the only fence; the service key would prove nothing.
import { user, rpc, anonRpc, insert, patch, expectError, assert, run } from './lib.mjs';

const suffix = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** One owned community per account (owned_community_cap_reached), so each needs its own owner. */
const community = (owner, privacy, extra = {}) =>
  rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: `Vs ${suffix()}`, p_type: 'club', p_country: 'PT', p_privacy: privacy, ...extra,
  });

/** Put the viewer in Lisbon so viewer_distance_m has something to measure from. */
const locate = (u, lat, lng) => rpc(u.jwt, 'set_my_location', { p_lat: lat, p_lng: lng, p_text: 'Here' });

const rail = (u, name) => rpc(u.jwt, name, { p_limit: 1000, p_offset: 0 });

await run('explore_players: followed people leave the rail, viewer_state reads none', async () => {
  const [alice, bob] = await Promise.all([user('vs-pa'), user('vs-pb')]);
  const cid = await community(alice, 'public');
  await insert('community_members', { community_id: cid, user_id: bob.id, role: 'member' });

  const row = (await rail(alice, 'explore_players')).find((p) => p.id === bob.id);
  assert(row, 'a community-mate is on the rail');
  assert(row.viewer_state === 'none', `viewer_state is none, got ${row.viewer_state}`);

  assert((await rpc(alice.jwt, 'follow_player', { p_user: bob.id })) === 'following', 'follow returns following');
  assert((await rpc(alice.jwt, 'follow_player', { p_user: bob.id })) === 'following', 'follow is idempotent');
  assert(!(await rail(alice, 'explore_players')).some((p) => p.id === bob.id), 'a followed player leaves the rail (D8)');
  // The edge is real: it shows in Alice's following list.
  const following = await rpc(alice.jwt, 'list_following', { p_user: alice.id });
  assert(following.some((p) => p.id === bob.id), 'follow_player wrote the follows row');

  assert((await rpc(alice.jwt, 'unfollow_player', { p_user: bob.id })) === 'none', 'unfollow returns none');
  assert((await rpc(alice.jwt, 'unfollow_player', { p_user: bob.id })) === 'none', 'unfollow is idempotent');
  assert((await rail(alice, 'explore_players')).some((p) => p.id === bob.id), 'unfollowing restores the rail');
});

await run('follow_player refuses self, blocked pairs in both directions, and unknown users', async () => {
  const [alice, bob, carol] = await Promise.all([user('vs-fa'), user('vs-fb'), user('vs-fc')]);

  await expectError(() => rpc(alice.jwt, 'follow_player', { p_user: alice.id }), 'cannot_follow_self');
  await expectError(() => rpc(alice.jwt, 'unfollow_player', { p_user: alice.id }), 'cannot_follow_self');
  await expectError(
    () => rpc(alice.jwt, 'follow_player', { p_user: '00000000-0000-0000-0000-000000000000' }),
    'user_not_found',
  );

  // I blocked them.
  await rpc(alice.jwt, 'block_user', { p_target: bob.id });
  await expectError(() => rpc(alice.jwt, 'follow_player', { p_user: bob.id }), 'blocked');
  // They blocked me: the reverse direction the table's RLS policy cannot see.
  await expectError(() => rpc(bob.jwt, 'follow_player', { p_user: alice.id }), 'blocked');
  // Unfollowing is never refused for a block; there is simply nothing to remove.
  assert((await rpc(bob.jwt, 'unfollow_player', { p_user: alice.id })) === 'none', 'unfollow a blocked pair is a no-op');

  await rpc(alice.jwt, 'unblock_user', { p_target: bob.id });
  assert((await rpc(alice.jwt, 'follow_player', { p_user: bob.id })) === 'following', 'unblocking allows following again');
  // An unrelated pair is untouched by someone else's block.
  assert((await rpc(carol.jwt, 'follow_player', { p_user: bob.id })) === 'following', 'a third party can follow');
});

await run('explore_communities: viewer_state, and pending requests leave the rail (B4)', async () => {
  const [viewer, o1, o2, o3] = await Promise.all([user('vs-cv'), user('vs-c1'), user('vs-c2'), user('vs-c3')]);
  const cPlain = await community(o1, 'public');
  const cReq = await community(o2, 'request_to_join');
  const cInv = await community(o3, 'public');

  const state = async (cid) => (await rail(viewer, 'explore_communities')).find((c) => c.id === cid)?.viewer_state;

  assert((await state(cPlain)) === 'none', 'a stranger community reads none');
  assert((await state(cReq)) === 'none', 'a request_to_join community reads none before requesting');

  // B4: once requested, it stops being offered.
  assert((await rpc(viewer.jwt, 'join_community', { p_community_id: cReq, p_ack: false })) === 'requested', 'request sent');
  assert(!(await rail(viewer, 'explore_communities')).some((c) => c.id === cReq), 'a pending request leaves the rail');
  // A declined request no longer blocks rediscovery.
  await patch('community_join_requests', `community_id=eq.${cReq}&user_id=eq.${viewer.id}`, { status: 'declined' });
  assert((await state(cReq)) === 'none', 'a declined request returns the community to the rail');

  // An invitation keeps the community on the rail and says so.
  await insert('community_invitations', { community_id: cInv, inviter_id: o3.id, invitee_id: viewer.id });
  assert((await state(cInv)) === 'invited', 'a pending invitation reads invited');

  // Members are excluded, as before.
  await rpc(viewer.jwt, 'join_community', { p_community_id: cPlain, p_ack: false });
  assert(!(await rail(viewer, 'explore_communities')).some((c) => c.id === cPlain), 'members are excluded');
});

await run('community geo: create and set_community_location write a point; distance ranks communities and groups', async () => {
  const [viewer, oNear, oFar, oNone, stranger] = await Promise.all([
    user('vs-gv'), user('vs-gn'), user('vs-gf'), user('vs-g0'), user('vs-gs'),
  ]);
  await locate(viewer, 38.7223, -9.1393); // Lisbon

  // Near: Lisbon, set at creation.
  const cNear = await community(oNear, 'public', { p_location: 'Lisbon, PT', p_location_lat: 38.73, p_location_lng: -9.15 });
  // Far: created without a point, located afterwards to Porto (~275 km).
  const cFar = await community(oFar, 'public', { p_location: 'Porto' });
  await rpc(oFar.jwt, 'set_community_location', {
    p_community_id: cFar, p_lat: 41.1579, p_lng: -8.6291, p_location: 'Porto, PT',
  });
  // None: no point at all.
  const cNone = await community(oNone, 'public', { p_location: 'Somewhere' });

  await expectError(
    () => community(stranger, 'public', { p_location_lat: 38.7 }),
    'invalid_location',
  );
  await expectError(
    () => rpc(stranger.jwt, 'set_community_location', { p_community_id: cFar, p_lat: 1, p_lng: 1, p_location: 'x' }),
    'forbidden',
  );
  await expectError(
    () => rpc(oFar.jwt, 'set_community_location', { p_community_id: cFar, p_lat: 91, p_lng: 1, p_location: 'x' }),
    'invalid_location',
  );

  const rows = await rail(viewer, 'explore_communities');
  const at = (cid) => rows.findIndex((c) => c.id === cid);
  const byId = (cid) => rows[at(cid)];
  assert(byId(cNear).distance_m > 0 && byId(cNear).distance_m < 5_000, `near distance ${byId(cNear).distance_m}`);
  assert(byId(cFar).distance_m > 200_000 && byId(cFar).distance_m < 350_000, `far distance ${byId(cFar).distance_m}`);
  assert(byId(cNone).distance_m === null, 'no point → null distance');
  assert(byId(cFar).location === 'Porto, PT', 'set_community_location wrote the label too');
  assert(!('location_point' in byId(cNear)), 'the raw geography stays out of the payload');
  // All three are PT, so the country boost ties and distance decides: near, far, then no point.
  assert(at(cNear) < at(cFar) && at(cFar) < at(cNone), `order near<far<none: ${at(cNear)},${at(cFar)},${at(cNone)}`);

  // Groups take their community's point (D2).
  const groups = await rail(viewer, 'explore_groups');
  const gNear = groups.find((g) => g.community_id === cNear);
  const gNone = groups.find((g) => g.community_id === cNone);
  assert(gNear && gNear.distance_m > 0 && gNear.distance_m < 5_000, 'group distance comes from its community');
  assert(gNear.viewer_state === 'none', 'a group the viewer is not in reads none');
  assert(gNone && gNone.distance_m === null, 'a group of a community with no point has null distance');

  // Clearing the point keeps the label.
  await rpc(oFar.jwt, 'set_community_location', { p_community_id: cFar, p_lat: null, p_lng: null, p_location: 'Porto' });
  const cleared = (await rail(viewer, 'explore_communities')).find((c) => c.id === cFar);
  assert(cleared.distance_m === null && cleared.location === 'Porto', 'null coordinates clear the point, keep the label');
});

await run('explore_groups: members are still excluded', async () => {
  const [owner, viewer] = await Promise.all([user('vs-xo'), user('vs-xv')]);
  const cid = await community(owner, 'public');
  const before = (await rail(viewer, 'explore_groups')).find((g) => g.community_id === cid);
  assert(before, 'the general group is offered');
  await rpc(viewer.jwt, 'join_group', { p_group_id: before.id, p_ack: false });
  assert(!(await rail(viewer, 'explore_groups')).some((g) => g.id === before.id), 'a joined group leaves the rail');
});

await run('anon cannot call any discovery or follow RPC', async () => {
  const ZERO = '00000000-0000-0000-0000-000000000000';
  const calls = [
    ['explore_players', { p_limit: 1, p_offset: 0 }],
    ['explore_communities', { p_limit: 1, p_offset: 0 }],
    ['explore_groups', { p_limit: 1, p_offset: 0 }],
    ['explore_events', { p_limit: 1, p_offset: 0 }],
    ['follow_player', { p_user: ZERO }],
    ['unfollow_player', { p_user: ZERO }],
    ['set_community_location', { p_community_id: ZERO, p_lat: null, p_lng: null, p_location: null }],
    // 0136: these three read profiles and follows, which RLS shows only to signed-in users, and
    // used to answer anon anyway.
    ['get_player_profile', { p_target: ZERO }],
    ['list_followers', { p_user: ZERO, p_search: null, p_limit: 1, p_offset: 0 }],
    ['list_following', { p_user: ZERO, p_search: null, p_limit: 1, p_offset: 0 }],
  ];
  for (const [name, args] of calls) {
    await expectError(() => anonRpc(name, args), 'permission denied for function');
  }
  // Signed in, the rails still answer.
  const u = await user('vs-anon');
  for (const [name, args] of calls.slice(0, 4)) {
    assert(Array.isArray(await rpc(u.jwt, name, args)), `${name} still works for authenticated`);
  }
});
