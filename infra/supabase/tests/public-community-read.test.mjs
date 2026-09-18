// infra/supabase/tests/public-community-read.test.mjs
//
// Migration 0100: a NON-MEMBER may read a public community's content, so UX-COMM-04's preview
// tabs have something to show.
//
// The widening is the easy half. What this file mostly asserts is the FENCE around it — that
// request_to_join and private communities did not move, that an archived community stops being
// public, that private groups and private events stay hidden, and that not one write widened.
// A security change is only as good as the things it still refuses.
//
// Reads go through PostgREST with each user's own JWT (`selAs`), never the service key, which
// bypasses RLS and would make every assertion here pass regardless. Content is SEEDED with the
// service key on purpose: the write gates are tested elsewhere, and driving them here (the
// review gate alone wants three completed events) would bury what is being tested.
import { user, rpc, sel, req, insert, expectError, assert, run } from './lib.mjs';

const selAs = (jwt, table, qs) => req(`/rest/v1/${table}?${qs}`, { jwt });

const club = (owner, name, privacy) =>
  rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: name, p_type: 'club', p_country: 'PT', p_privacy: privacy,
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });

const generalGroup = async (communityId) =>
  (await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`))[0].id;

/** Seeded as service role: these are fixtures for the READ assertions, not write-path tests. */
const seedPost = async (communityId, authorId, body) =>
  (await insert('community_posts', { community_id: communityId, author_id: authorId, kind: 'user', body }))[0];

const seedEvent = async (groupId, organizerId, { isPrivate = false, name = 'Friday Americano' } = {}) =>
  (await insert('events', {
    organizer_id: organizerId, group_id: groupId, name,
    event_type: 'americano', specification: 'classic', scoring_mode: 'points',
    num_courts: 2, duration_minutes: 90, organizer_role: 'organizing_and_playing',
    starts_at: new Date(Date.now() + 86_400_000).toISOString(), is_private: isPrivate,
  }))[0];

// ---------------------------------------------------------------------------
// 1. The widening itself
// ---------------------------------------------------------------------------

await run('a non-member reads a public community: posts, likes, comments, groups, reviews, events', async () => {
  const admin = await user('pub-admin');
  const outsider = await user('pub-outsider');
  const cid = await club(admin, 'Readable Club', 'public');
  const gid = await generalGroup(cid);

  const post = await seedPost(cid, admin.id, 'Anyone can read this.');
  await insert('post_likes', { post_id: post.id, user_id: admin.id });
  await insert('post_comments', { post_id: post.id, author_id: admin.id, body: 'And this.' });
  await insert('community_reviews', { community_id: cid, user_id: admin.id, rating: 5, body: 'Great club.' });
  await seedEvent(gid, admin.id);

  assert((await selAs(outsider.jwt, 'community_posts', `community_id=eq.${cid}&select=id`)).length === 1, 'posts');
  assert((await selAs(outsider.jwt, 'post_likes', `post_id=eq.${post.id}&select=user_id`)).length === 1, 'likes');
  assert((await selAs(outsider.jwt, 'post_comments', `post_id=eq.${post.id}&select=id`)).length === 1, 'comments');
  assert((await selAs(outsider.jwt, 'groups', `community_id=eq.${cid}&select=id`)).length >= 1, 'groups');
  assert((await selAs(outsider.jwt, 'community_reviews', `community_id=eq.${cid}&select=id`)).length === 1, 'reviews');
  assert((await selAs(outsider.jwt, 'events', `group_id=eq.${gid}&select=id`)).length === 1, 'events');
});

// ---------------------------------------------------------------------------
// 2. The fence: the other two privacy modes did not move
// ---------------------------------------------------------------------------

for (const privacy of ['request_to_join', 'private']) {
  await run(`a non-member of a ${privacy} community reads none of its content`, async () => {
    const admin = await user(`${privacy}-admin`);
    const outsider = await user(`${privacy}-outsider`);
    const cid = await club(admin, `Closed ${privacy}`, privacy);
    const gid = await generalGroup(cid);

    const post = await seedPost(cid, admin.id, 'Members only.');
    await insert('post_likes', { post_id: post.id, user_id: admin.id });
    await insert('post_comments', { post_id: post.id, author_id: admin.id, body: 'Members only.' });
    await insert('community_reviews', { community_id: cid, user_id: admin.id, rating: 4, body: 'Members only.' });
    await seedEvent(gid, admin.id);

    assert((await selAs(outsider.jwt, 'community_posts', `community_id=eq.${cid}&select=id`)).length === 0, 'no posts');
    assert((await selAs(outsider.jwt, 'post_likes', `post_id=eq.${post.id}&select=user_id`)).length === 0, 'no likes');
    assert((await selAs(outsider.jwt, 'post_comments', `post_id=eq.${post.id}&select=id`)).length === 0, 'no comments');
    assert((await selAs(outsider.jwt, 'groups', `community_id=eq.${cid}&select=id`)).length === 0, 'no groups');
    assert((await selAs(outsider.jwt, 'community_reviews', `community_id=eq.${cid}&select=id`)).length === 0, 'no reviews');
    assert((await selAs(outsider.jwt, 'events', `group_id=eq.${gid}&select=id`)).length === 0, 'no events');
  });
}

// ---------------------------------------------------------------------------
// 3. The fence: archiving revokes it (0099's rule, which 0100 must not undo)
// ---------------------------------------------------------------------------

await run('archiving a public community takes its content back out of reach', async () => {
  const admin = await user('arch-admin');
  const outsider = await user('arch-outsider');
  const cid = await club(admin, 'Archivable Club', 'public');
  const gid = await generalGroup(cid);
  const post = await seedPost(cid, admin.id, 'Visible until it is not.');
  await seedEvent(gid, admin.id);

  assert((await selAs(outsider.jwt, 'community_posts', `community_id=eq.${cid}&select=id`)).length === 1, 'readable first');

  await rpc(admin.jwt, 'archive_community', { p_community_id: cid, p_archive: true });

  assert((await selAs(outsider.jwt, 'community_posts', `community_id=eq.${cid}&select=id`)).length === 0, 'posts gone');
  assert((await selAs(outsider.jwt, 'post_comments', `post_id=eq.${post.id}&select=id`)).length === 0, 'comments gone');
  assert((await selAs(outsider.jwt, 'groups', `community_id=eq.${cid}&select=id`)).length === 0, 'groups gone');
  assert((await selAs(outsider.jwt, 'events', `group_id=eq.${gid}&select=id`)).length === 0, 'events gone');
  // The admin keeps their archived community, which the switcher's Archived section needs.
  assert((await selAs(admin.jwt, 'communities', `id=eq.${cid}&select=id`)).length === 1, 'admin still sees it');
});

// ---------------------------------------------------------------------------
// 4. The fence: private groups and private events stay private
// ---------------------------------------------------------------------------

await run('a private group, and a private event, stay hidden inside a public community', async () => {
  const admin = await user('priv-child-admin');
  const outsider = await user('priv-child-outsider');
  const cid = await club(admin, 'Mixed Visibility Club', 'public');
  const openGroup = await generalGroup(cid);

  // Starter allows one group and the general group holds it; basic lifts that.
  await insert('community_subscriptions', {
    community_id: cid, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual',
  });
  const [secret] = await insert('groups', {
    community_id: cid, name: 'Committee', is_private: true, created_by: admin.id,
  });

  const openEvent = await seedEvent(openGroup, admin.id, { name: 'Open Night' });
  const privateEvent = await seedEvent(openGroup, admin.id, { isPrivate: true, name: 'Invite Only' });
  const eventInSecretGroup = await seedEvent(secret.id, admin.id, { name: 'Committee Meet' });

  const groups = await selAs(outsider.jwt, 'groups', `community_id=eq.${cid}&select=id`);
  assert(!groups.some((g) => g.id === secret.id), 'the private group is not listed');
  assert(groups.some((g) => g.id === openGroup), 'the open group is');

  const ids = (await selAs(outsider.jwt, 'events', `select=id`)).map((e) => e.id);
  assert(ids.includes(openEvent.id), 'the open event is visible');
  assert(!ids.includes(privateEvent.id), 'the private event is not');
  assert(!ids.includes(eventInSecretGroup.id), 'an event in a private group is not');
});

// ---------------------------------------------------------------------------
// 5. The fence: nothing became writable
// ---------------------------------------------------------------------------

await run('a non-member of a public community can read it but cannot write to it', async () => {
  const admin = await user('write-admin');
  const outsider = await user('write-outsider');
  const cid = await club(admin, 'Read Only To You', 'public');
  const post = await seedPost(cid, admin.id, 'Look, do not touch.');

  assert((await selAs(outsider.jwt, 'community_posts', `community_id=eq.${cid}&select=id`)).length === 1, 'reads it');

  const asOutsider = (table, body) =>
    req(`/rest/v1/${table}`, { method: 'POST', jwt: outsider.jwt, body, prefer: 'return=representation' });

  // PostgREST answers an insert the policy refuses with 403 "violates row-level security policy",
  // so matching on that phrase proves it was RLS and not a schema or constraint error.
  const RLS = 'row-level security';
  await expectError(() => asOutsider('post_likes', { post_id: post.id, user_id: outsider.id }), RLS);
  await expectError(() => asOutsider('post_comments', { post_id: post.id, author_id: outsider.id, body: 'hi' }), RLS);
  await expectError(
    () => asOutsider('community_posts', { community_id: cid, author_id: outsider.id, kind: 'user', body: 'hi' }),
    RLS,
  );
});

// ---------------------------------------------------------------------------
// 6. The member count, without the roster
// ---------------------------------------------------------------------------

await run('an outsider counts a closed community\'s members without being able to name them', async () => {
  const admin = await user('count-admin');
  const joiner = await user('count-joiner');
  const outsider = await user('count-outsider');
  const cid = await club(admin, 'Countable Club', 'request_to_join');

  // Two members: the creator, plus one the admin lets in.
  await rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: false });
  const [reqRow] = await sel('community_join_requests', `community_id=eq.${cid}&user_id=eq.${joiner.id}&select=id`);
  await rpc(admin.jwt, 'accept_join_request', { p_request_id: reqRow.id });

  // The roster stays shut — this is the part that must NOT have widened.
  const roster = await selAs(outsider.jwt, 'community_members', `community_id=eq.${cid}&select=user_id`);
  assert(roster.length === 0, 'the roster is still invisible to an outsider');

  // The number is not.
  assert((await rpc(outsider.jwt, 'community_member_count', { c: cid })) === 2, 'the count is readable');

  // And it follows the archive, like everything else in this migration.
  await rpc(admin.jwt, 'archive_community', { p_community_id: cid, p_archive: true });
  assert((await rpc(outsider.jwt, 'community_member_count', { c: cid })) === 0, 'an archived community counts zero');
});
