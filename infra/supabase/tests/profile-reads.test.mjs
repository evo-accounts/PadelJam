// infra/supabase/tests/profile-reads.test.mjs
//
// Migration 0102 — the reads the rebuilt profile screens need.
//
// Every assertion goes through PostgREST with a real user's JWT, never the service key, which
// bypasses row-level security and would make most of this pass regardless. That matters more than
// usual here: four of the five functions are `security definer`, so their visibility rules ARE the
// only fence, and a test that cannot see the fence cannot see it fall.
//
// The half worth reading is the negative space — who does NOT appear.
import { user, rpc, insert, assert, run } from './lib.mjs';

/** Starter caps a community at ONE group, and create_community_with_personal_tenant already made
 *  the general one. Any test needing a second group buys its way past the cap, exactly as
 *  infra/supabase/tests/social_graph.sql does — the cap itself is tested in caps.sql. */
const liftGroupCap = (cid) => insert('community_subscriptions', { community_id: cid, plan_id: 'basic' });

const block   = (u, target) => rpc(u.jwt, 'block_user',   { p_target: target });
const unblock = (u, target) => rpc(u.jwt, 'unblock_user', { p_target: target });
const follow  = (u, target) => insert('follows', { follower_id: u.id, followee_id: target });

await run('list_my_blocks returns who I blocked, and only me', async () => {
  const [alice, bob, carol] = await Promise.all([user('lmb-a'), user('lmb-b'), user('lmb-c')]);

  assert((await rpc(alice.jwt, 'list_my_blocks')).length === 0, 'starts empty');

  await block(alice, bob.id);
  const mine = await rpc(alice.jwt, 'list_my_blocks');
  assert(mine.length === 1 && mine[0].id === bob.id, 'blocked user is listed');
  // The POINT of this function: `profiles: read` hides the row in BOTH directions, so the blocker
  // cannot read it either. If this came back null the collapsed profile would have nothing to show.
  assert(mine[0].full_name != null, 'the name comes back despite the symmetric read policy');

  // Bob blocked nobody. The list is the CALLER's, not a global one.
  assert((await rpc(bob.jwt, 'list_my_blocks')).length === 0, "the person I blocked sees no list of their own");
  assert((await rpc(carol.jwt, 'list_my_blocks')).length === 0, 'an unrelated user sees nothing');

  const found = await rpc(alice.jwt, 'list_my_blocks', { p_search: bob.id.slice(0, 0) + 'lmb-b' });
  assert(found.length === 1, 'search matches on name');
  assert((await rpc(alice.jwt, 'list_my_blocks', { p_search: 'zzzz-no-such' })).length === 0, 'search excludes');

  await unblock(alice, bob.id);
  assert((await rpc(alice.jwt, 'list_my_blocks')).length === 0, 'unblock removes the row');
});

await run('explore_players hides people blocked in either direction', async () => {
  const [alice, bob] = await Promise.all([user('exp-a'), user('exp-b')]);
  // explore_players ranks on SHARED communities, so give them one.
  const cid = await rpc(alice.jwt, 'create_community_with_personal_tenant', {
    p_name: `Exp ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_members', { community_id: cid, user_id: bob.id, role: 'member' });

  const sees = async (u, target) =>
    (await rpc(u.jwt, 'explore_players', { p_limit: 100 })).some((p) => p.id === target);

  assert(await sees(alice, bob.id), 'a community-mate is discoverable to begin with');

  // Forward: I blocked them.
  await block(alice, bob.id);
  assert(!(await sees(alice, bob.id)), 'someone I blocked is gone from Explore');
  // Reverse: THEY blocked me. This is the direction UX-PROF-03 calls "absent entirely", and the
  // direction that leaked before 0102 — explore_players is security definer, so the profiles
  // policy never saw it.
  assert(!(await sees(bob, alice.id)), 'someone who blocked me is gone from Explore too');

  await unblock(alice, bob.id);
  assert(await sees(alice, bob.id), 'unblocking restores discoverability');
});

await run('follower lists carry MY relationship, even in someone else\'s list', async () => {
  const [alice, bob, carol] = await Promise.all([user('flw-a'), user('flw-b'), user('flw-c')]);

  // Carol follows Bob. Alice follows Carol but not Bob.
  await follow(carol, bob.id);
  await follow(alice, carol.id);

  // Alice browses BOB's followers, which is Carol.
  const bobsFollowers = await rpc(alice.jwt, 'list_followers', { p_user: bob.id });
  const row = bobsFollowers.find((r) => r.id === carol.id);
  assert(row, "Bob's follower is listed");
  // The flags describe ALICE's relationship with Carol, not Bob's. That is the whole point of
  // UX-PROF-05's in-list follow control, and the reason they are computed against auth.uid().
  assert(row.is_following === true, 'Alice follows Carol, so the row says so');
  assert(row.is_followed_by === false, 'Carol does not follow Alice back');

  // And from Carol's own view of the same list, the flags differ.
  const sameListAsCarol = await rpc(carol.jwt, 'list_followers', { p_user: bob.id });
  const self = sameListAsCarol.find((r) => r.id === carol.id);
  assert(self && self.is_following === false, 'Carol does not follow herself');

  // Blocking still removes the row entirely.
  await block(alice, carol.id);
  assert(!(await rpc(alice.jwt, 'list_followers', { p_user: bob.id })).some((r) => r.id === carol.id),
    'a blocked user drops out of the list');
  await unblock(alice, carol.id);
});

await run('my_groups: mine in full, a stranger\'s only where we overlap', async () => {
  const [alice, bob] = await Promise.all([user('mg-a'), user('mg-b')]);

  const cid = await rpc(bob.jwt, 'create_community_with_personal_tenant', {
    p_name: `MG ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await liftGroupCap(cid);
  const [pub] = await insert('groups', { community_id: cid, name: 'Open group', is_private: false, created_by: bob.id });
  const [priv] = await insert('groups', { community_id: cid, name: 'Hidden group', is_private: true, created_by: bob.id });
  await insert('group_members', [{ group_id: pub.id, user_id: bob.id }, { group_id: priv.id, user_id: bob.id }]);

  // Bob's own view: everything, with the managing flag.
  const own = await rpc(bob.jwt, 'my_groups');
  assert(own.some((g) => g.group_id === priv.id), 'my own private group is mine to see');
  assert(own.every((g) => g.is_managing !== null), 'is_managing is answered for myself');

  // Alice is NOT in the community yet: nothing at all, not even the public group.
  assert((await rpc(alice.jwt, 'my_groups', { p_user: bob.id })).length === 0,
    'no overlap means no groups');

  // Now she joins the community.
  await insert('community_members', { community_id: cid, user_id: alice.id, role: 'member' });
  const shared = await rpc(alice.jwt, 'my_groups', { p_user: bob.id });
  assert(shared.some((g) => g.group_id === pub.id), 'the shared public group shows');
  assert(!shared.some((g) => g.group_id === priv.id), 'the private group stays hidden');
  assert(shared.every((g) => g.is_managing === null), 'is_managing is withheld for someone else');

  // A block hides the whole section.
  await block(alice, bob.id);
  assert((await rpc(alice.jwt, 'my_groups', { p_user: bob.id })).length === 0, 'blocked: nothing');
  await unblock(alice, bob.id);

  // The zero-argument call every existing client makes still resolves.
  assert(Array.isArray(await rpc(bob.jwt, 'my_groups')), 'my_groups() with no args still works');
});

await run('player_recent_results returns scores, court and both pairs', async () => {
  const [alice, bob] = await Promise.all([user('prr-a'), user('prr-b')]);

  const cid = await rpc(bob.jwt, 'create_community_with_personal_tenant', {
    p_name: `PRR ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await liftGroupCap(cid);
  const [grp] = await insert('groups', { community_id: cid, name: 'PRR group', is_private: false, created_by: bob.id });
  const [ev] = await insert('events', {
    organizer_id: bob.id, group_id: grp.id, name: 'PRR event',
    event_type: 'americano', specification: 'classic', scoring_mode: 'points',
    num_courts: 1, duration_minutes: 60, organizer_role: 'organizing_and_playing',
    starts_at: new Date(Date.now() - 86_400_000).toISOString(), status: 'completed', is_private: false,
  });
  const parts = await insert('event_participants', [
    { event_id: ev.id, user_id: bob.id, status: 'confirmed' },
    { event_id: ev.id, user_id: alice.id, status: 'confirmed' },
  ]);
  const [round] = await insert('event_rounds', { event_id: ev.id, round_number: 1, status: 'completed' });
  const [match] = await insert('event_matches', {
    event_id: ev.id, round_id: round.id, court_number: 1, match_number: 1,
    side_a_score: 24, side_b_score: 18, status: 'played', submitted_at: new Date().toISOString(),
  });
  await insert('match_players', [
    { match_id: match.id, participant_id: parts.find((p) => p.user_id === bob.id).id, side: 'a' },
    { match_id: match.id, participant_id: parts.find((p) => p.user_id === alice.id).id, side: 'b' },
  ]);

  const rows = await rpc(bob.jwt, 'player_recent_results', { p_user: bob.id });
  assert(rows.length === 1, 'the played match comes back');
  const r = rows[0];
  assert(r.side_a_score === 24 && r.side_b_score === 18, 'the score is the recorded one');
  assert(r.player_side === 'a', "the requested player's side is reported");
  assert(r.court_label === 'Court 1', 'an unnamed court falls back to its number');
  assert(r.side_a_names.length === 1 && r.side_b_names.length === 1, 'both sides are named');
  assert(r.event_name === 'PRR event', 'the event is named');

  // Alice played it too, and reads the same match from her own side.
  const hers = await rpc(alice.jwt, 'player_recent_results', { p_user: alice.id });
  assert(hers.length === 1 && hers[0].player_side === 'b', 'the other player sees side b');

  // Visibility is delegated to event_is_visible, and this asserts BOTH directions of that.
  //
  // An outsider DOES see this one, and that is correct rather than a leak: migration 0100 makes a
  // public community's public group's non-private event readable by any signed-in user, because
  // that is what the community preview renders. A result from it is no more private than the event.
  // Narrowing it here would make the profile the one screen in the app that disagrees.
  const carol = await user('prr-c');
  assert((await rpc(carol.jwt, 'player_recent_results', { p_user: bob.id })).length === 1,
    'a public event is public, results included');

  // The fence is the PRIVATE event. Same community, same players, hidden from Carol.
  const [secret] = await insert('events', {
    organizer_id: bob.id, group_id: grp.id, name: 'PRR private',
    event_type: 'americano', specification: 'classic', scoring_mode: 'points',
    num_courts: 1, duration_minutes: 60, organizer_role: 'organizing_and_playing',
    starts_at: new Date(Date.now() - 172_800_000).toISOString(), status: 'completed', is_private: true,
  });
  const sparts = await insert('event_participants', [
    { event_id: secret.id, user_id: bob.id, status: 'confirmed' },
    { event_id: secret.id, user_id: alice.id, status: 'confirmed' },
  ]);
  const [sround] = await insert('event_rounds', { event_id: secret.id, round_number: 1, status: 'completed' });
  const [smatch] = await insert('event_matches', {
    event_id: secret.id, round_id: sround.id, court_number: 1, match_number: 1,
    side_a_score: 21, side_b_score: 9, status: 'played', submitted_at: new Date().toISOString(),
  });
  await insert('match_players', [
    { match_id: smatch.id, participant_id: sparts.find((p) => p.user_id === bob.id).id, side: 'a' },
    { match_id: smatch.id, participant_id: sparts.find((p) => p.user_id === alice.id).id, side: 'b' },
  ]);

  assert((await rpc(bob.jwt, 'player_recent_results', { p_user: bob.id })).length === 2,
    'a participant sees their private result');
  assert((await rpc(carol.jwt, 'player_recent_results', { p_user: bob.id })).length === 1,
    'an outsider still sees only the public one');

  // A match with no score recorded is not a result.
  await insert('event_matches', {
    event_id: ev.id, round_id: round.id, court_number: 1, match_number: 2, status: 'pending',
  });
  assert((await rpc(bob.jwt, 'player_recent_results', { p_user: bob.id })).length === 2,
    'an unplayed match is not counted');
});

console.log('\nall profile-read checks passed');
