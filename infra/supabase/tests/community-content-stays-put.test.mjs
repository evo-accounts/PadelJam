// infra/supabase/tests/community-content-stays-put.test.mjs
// Migration 0137: posts, comments, likes and reviews stay in the community they were written in, as
// they were written, by whoever wrote them. Each "cannot" on a post or a review was a working
// exploit before 0137 — an author moving a post into a community they never joined or may not post
// in, an admin of two communities moving a member's post between them, re-attributing it or
// rewriting it, a reviewer moving a review past the review gate, a member back-dating or
// future-dating what they wrote, dressing a post up as an event result, or planting an event's id
// so its organizer can never post the result. Comments and likes were one policy away from being
// moved too. Each "can" is the app path that must keep working beside it.
import { user, rpc, req, sel, insert, patch, expectError, assert, run, ANON, BASE_URL } from './lib.mjs';

const communityArgs = (name, privacy) => ({
  p_name: name, p_type: 'club', p_country: 'PT', p_privacy: privacy,
  p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
  p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
});
// A missing privilege (the table or the column) and a refused row are different failures: matching
// on the phrase proves which one stopped the write, not a schema or constraint error.
const DENIED = 'permission denied';
const deniedOn = (table) => `permission denied for table ${table}`;
const RLS = 'row-level security';
/** A write with the user's own JWT, returning the affected rows. */
const as = (jwt, path, method, body) => req(path, { method, jwt, body, prefer: 'return=representation' });
/** A request with no session, sent the way lib.mjs's anonRpc sends one: apikey = the anon key and
 *  NO Authorization header. req(path, { jwt: ANON }) is not that: it sends apikey = the service key,
 *  and when that key is an sb_secret_ key Kong runs the call as service_role, whatever the bearer. */
async function anonReq(path, { method = 'GET', body } = {}) {
  if (!ANON) throw new Error('Missing SUPABASE_ANON_KEY');
  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`anon ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const owner = await user('ccs-owner');       // admin of P (private) and Q (public); organizes P's events
const author = await user('ccs-author');     // member of P and Q; review-eligible in P, has not reviewed
const reviewer = await user('ccs-reviewer'); // member of P and Q; review-eligible in P only
const stranger = await user('ccs-stranger'); // owns W (public), which the author never joined

const P = await rpc(owner.jwt, 'create_community_with_personal_tenant', communityArgs('Content Vault', 'private'));
const Q = await rpc(owner.jwt, 'create_community_with_personal_tenant', communityArgs('Content Square', 'public'));
const W = await rpc(stranger.jwt, 'create_community_with_personal_tenant', communityArgs('Content Elsewhere', 'public'));
await rpc(owner.jwt, 'invite_to_community', { p_community_id: P, p_invitee_ids: [author.id, reviewer.id] });
for (const u of [author, reviewer]) {
  const [inv] = await sel('community_invitations', `community_id=eq.${P}&invitee_id=eq.${u.id}&select=id`);
  await rpc(u.jwt, 'accept_invitation', { p_invitation_id: inv.id, p_ack: true });
  await rpc(u.jwt, 'join_community', { p_community_id: Q, p_ack: true });
}
// In Q members may not post, so a post moved there would also have skipped can_create_post.
await patch('community_permissions', `community_id=eq.${Q}`, { create_posts: false });

// Review eligibility in P only (CM-40: three completed events in the community), seeded with the
// service key — the gate itself is community_review_gate.sql's business. The owner organizes them,
// which is also what lets them post a result below.
const [{ id: Pgeneral }] = await sel('groups', `community_id=eq.${P}&is_general=eq.true&select=id`);
const events = [];
for (let i = 0; i < 3; i += 1) {
  const [ev] = await insert('events', {
    organizer_id: owner.id, group_id: Pgeneral, name: `CCS ${i}`,
    event_type: 'americano', specification: 'classic', scoring_mode: 'points',
    num_courts: 1, duration_minutes: 60, organizer_role: 'organizing_and_playing',
    starts_at: new Date(Date.now() - (i + 2) * 86_400_000).toISOString(), status: 'completed',
  });
  await insert('event_participants', [
    { event_id: ev.id, user_id: reviewer.id, status: 'confirmed' },
    { event_id: ev.id, user_id: author.id, status: 'confirmed' },
  ]);
  events.push(ev.id);
}

// The content, written the way the apps write it (useCreatePost, useAddComment, useToggleLike,
// useUpsertReview) — the exact columns, no more.
const BODY = 'Tuesday 19h, who is in?';
const [post] = await as(author.jwt, '/rest/v1/community_posts', 'POST', { community_id: P, author_id: author.id, kind: 'user', body: BODY, image_path: null });
const [qPost] = await as(owner.jwt, '/rest/v1/community_posts', 'POST', { community_id: Q, author_id: owner.id, kind: 'user', body: 'Welcome', image_path: null });
const [comment] = await as(author.jwt, '/rest/v1/post_comments', 'POST', { post_id: post.id, author_id: author.id, body: 'Me!' });
await as(author.jwt, '/rest/v1/post_likes', 'POST', { post_id: post.id, user_id: author.id });
await rpc(reviewer.jwt, 'upsert_community_review', { p_community_id: P, p_rating: 5, p_body: 'Great club' });
const [review] = await sel('community_reviews', `community_id=eq.${P}&user_id=eq.${reviewer.id}&select=id`);

const postRow = async (id) => (await sel('community_posts', `id=eq.${id}&select=community_id,author_id,body`))[0];
const postsBy = async (uid) => sel('community_posts', `author_id=eq.${uid}&select=id,body`);

// ── cannot: move or rewrite ─────────────────────────────────────────────────────────────────────

await run('an author cannot move their post — not into a public community, not into one they may not post in', async () => {
  const path = `/rest/v1/community_posts?id=eq.${post.id}`;
  await expectError(() => as(author.jwt, path, 'PATCH', { community_id: W }), DENIED);
  await expectError(() => as(author.jwt, path, 'PATCH', { community_id: Q }), DENIED);
  // Nor edit it in place: no app edits a post.
  await expectError(() => as(author.jwt, path, 'PATCH', { body: 'Edited' }), DENIED);
  const row = await postRow(post.id);
  assert(row.community_id === P && row.body === BODY, `unchanged, got ${JSON.stringify(row)}`);
});

await run('an upsert is not a way around it', async () => {
  // resolution=merge-duplicates makes the POST an INSERT … ON CONFLICT DO UPDATE: it needs UPDATE,
  // and INSERT on id, and the API roles have neither.
  await expectError(
    () => req('/rest/v1/community_posts?on_conflict=id', {
      method: 'POST', jwt: author.jwt, prefer: 'resolution=merge-duplicates',
      body: { id: post.id, community_id: P, author_id: author.id, kind: 'user', body: 'Rewritten by upsert' },
    }),
    DENIED,
  );
  assert((await postRow(post.id)).body === BODY, 'unchanged');
});

await run("an admin of two communities cannot move a member's post, re-attribute it or rewrite it", async () => {
  const path = `/rest/v1/community_posts?id=eq.${post.id}`;
  await expectError(() => as(owner.jwt, path, 'PATCH', { community_id: Q }), DENIED);
  await expectError(() => as(owner.jwt, path, 'PATCH', { author_id: stranger.id }), DENIED);
  await expectError(() => as(owner.jwt, path, 'PATCH', { body: 'Words the author never wrote' }), DENIED);
  const row = await postRow(post.id);
  assert(row.community_id === P && row.author_id === author.id && row.body === BODY, `unchanged, got ${JSON.stringify(row)}`);
});

await run('a reviewer cannot move their review to a community whose review gate they have not passed', async () => {
  assert((await rpc(reviewer.jwt, 'can_review_community', { p_community_id: Q })) === false, 'not eligible in Q');
  const path = `/rest/v1/community_reviews?id=eq.${review.id}`;
  await expectError(() => as(reviewer.jwt, path, 'PATCH', { community_id: Q }), DENIED);
  await expectError(() => as(reviewer.jwt, path, 'PATCH', { rating: 1 }), DENIED);
  const [row] = await sel('community_reviews', `id=eq.${review.id}&select=community_id,rating`);
  assert(row.community_id === P && row.rating === 5, `unchanged, got ${JSON.stringify(row)}`);
});

await run("a comment or a like cannot be re-pointed at another community's post", async () => {
  await expectError(() => as(author.jwt, `/rest/v1/post_comments?id=eq.${comment.id}`, 'PATCH', { post_id: qPost.id }), DENIED);
  await expectError(
    () => as(author.jwt, `/rest/v1/post_likes?post_id=eq.${post.id}&user_id=eq.${author.id}`, 'PATCH', { post_id: qPost.id }),
    DENIED,
  );
  assert((await sel('post_comments', `id=eq.${comment.id}&select=post_id`))[0].post_id === post.id, 'the comment stayed');
  assert((await sel('post_likes', `post_id=eq.${post.id}&user_id=eq.${author.id}&select=post_id`)).length === 1, 'the like stayed');
});

// ── cannot: forge on the way in ─────────────────────────────────────────────────────────────────

await run('a member cannot date a post, comment, like or review themselves', async () => {
  const FUTURE = '2076-01-01T00:00:00Z';
  // A post dated 2076 would sit at the top of a feed ordered by created_at for fifty years.
  await expectError(
    () => as(author.jwt, '/rest/v1/community_posts', 'POST', { community_id: P, author_id: author.id, kind: 'user', body: 'Pinned', created_at: FUTURE }),
    DENIED,
  );
  await expectError(
    () => as(author.jwt, '/rest/v1/post_comments', 'POST', { post_id: post.id, author_id: author.id, body: 'First!', created_at: '1970-01-01T00:00:00Z' }),
    DENIED,
  );
  await expectError(
    () => as(reviewer.jwt, '/rest/v1/post_likes', 'POST', { post_id: post.id, user_id: reviewer.id, created_at: FUTURE }),
    DENIED,
  );
  // The author may review P ("reviews: write" would let the row through), so only the column stops it.
  assert((await rpc(author.jwt, 'can_review_community', { p_community_id: P })) === true, 'the author is review-eligible in P');
  await expectError(
    () => as(author.jwt, '/rest/v1/community_reviews', 'POST', { community_id: P, user_id: author.id, rating: 5, body: 'Old news', created_at: '1970-01-01T00:00:00Z' }),
    DENIED,
  );
  assert((await postsBy(author.id)).every((p) => p.body !== 'Pinned'), 'no dated post');
  assert((await sel('post_comments', `post_id=eq.${post.id}&select=id`)).length === 1, 'no dated comment');
  assert((await sel('post_likes', `post_id=eq.${post.id}&user_id=eq.${reviewer.id}&select=post_id`)).length === 0, 'no dated like');
  assert((await sel('community_reviews', `community_id=eq.${P}&user_id=eq.${author.id}&select=id`)).length === 0, 'no dated review');
});

await run('a member cannot write a result post by hand, or plant an event on an ordinary post', async () => {
  // kind = 'result' is post_event_result's alone: refused by "posts: create", not by a missing column.
  await expectError(
    () => as(author.jwt, '/rest/v1/community_posts', 'POST', { community_id: P, author_id: author.id, kind: 'result', body: 'Final: me, 1st' }),
    RLS,
  );
  // result_event_id is not a column clients may write. Before 0137 this row went in, and the
  // organizer's post_event_result then answered 'already_posted' for good.
  await expectError(
    () => as(author.jwt, '/rest/v1/community_posts', 'POST', { community_id: P, author_id: author.id, kind: 'user', body: 'Nothing to see', result_event_id: events[0] }),
    DENIED,
  );
  assert((await sel('community_posts', `result_event_id=eq.${events[0]}&select=id`)).length === 0, 'no post names the event');
});

await run('anon writes nothing on posts, comments, likes or reviews', async () => {
  assert(ANON, 'SUPABASE_ANON_KEY must be set: these requests prove what the anon role may do, so they must go out with the anon key');
  // Proof the requests below really run as anon: the service role would read P's (private) post.
  assert((await anonReq(`/rest/v1/community_posts?id=eq.${post.id}&select=id`)).length === 0, 'the anon requests run as anon, not service_role');
  // Before 0137 anon held INSERT, UPDATE and DELETE here (platform default privileges): the INSERTs
  // were refused by RLS (or, on reviews, by can_review_community, which anon may not EXECUTE), and
  // the PATCH and DELETE answered 2xx with nothing changed. Now each is refused for want of the
  // privilege on the table itself — hence the table in every match.
  await expectError(
    () => anonReq('/rest/v1/community_posts', { method: 'POST', body: { community_id: Q, author_id: author.id, kind: 'user', body: 'anon' } }),
    deniedOn('community_posts'),
  );
  await expectError(
    () => anonReq('/rest/v1/post_comments', { method: 'POST', body: { post_id: qPost.id, author_id: author.id, body: 'anon' } }),
    deniedOn('post_comments'),
  );
  await expectError(() => anonReq(`/rest/v1/community_posts?id=eq.${qPost.id}`, { method: 'PATCH', body: { body: 'anon' } }), deniedOn('community_posts'));
  await expectError(() => anonReq(`/rest/v1/post_likes?post_id=eq.${post.id}`, { method: 'DELETE' }), deniedOn('post_likes'));
  await expectError(
    () => anonReq('/rest/v1/community_reviews', { method: 'POST', body: { community_id: P, user_id: author.id, rating: 1 } }),
    deniedOn('community_reviews'),
  );
  assert((await postsBy(author.id)).every((p) => p.body !== 'anon'), 'no anon post');
  assert((await sel('post_comments', `post_id=eq.${qPost.id}&select=id`)).length === 0, 'no anon comment');
  assert((await postRow(qPost.id)).body === 'Welcome', 'the post was not rewritten');
  assert((await sel('post_likes', `post_id=eq.${post.id}&user_id=eq.${author.id}&select=post_id`)).length === 1, 'the like stayed');
  assert((await sel('community_reviews', `community_id=eq.${P}&user_id=eq.${author.id}&select=id`)).length === 0, 'no anon review');
});

// ── can ─────────────────────────────────────────────────────────────────────────────────────────

await run('a member can still post, like, unlike and comment', async () => {
  const [second] = await as(author.jwt, '/rest/v1/community_posts', 'POST', { community_id: P, author_id: author.id, kind: 'user', body: 'Second', image_path: null });
  assert(second?.community_id === P && second.kind === 'user' && second.result_event_id === null, `posted, got ${JSON.stringify(second)}`);
  // The server dates it, not the client.
  assert(Math.abs(Date.parse(second.created_at) - Date.now()) < 5 * 60_000, `dated now, got ${second.created_at}`);
  await as(reviewer.jwt, '/rest/v1/post_likes', 'POST', { post_id: second.id, user_id: reviewer.id });
  const unliked = await as(reviewer.jwt, `/rest/v1/post_likes?post_id=eq.${second.id}&user_id=eq.${reviewer.id}`, 'DELETE');
  assert(unliked.length === 1, `unliked, got ${JSON.stringify(unliked)}`);
  const [reply] = await as(reviewer.jwt, '/rest/v1/post_comments', 'POST', { post_id: second.id, author_id: reviewer.id, body: 'Count me in' });
  assert(reply?.post_id === second.id, 'commented');
});

await run('an organizer can still post a result — post_event_result is the one way a result post is made', async () => {
  const id = await rpc(owner.jwt, 'post_event_result', { p_event_id: events[0] });
  const [row] = await sel('community_posts', `id=eq.${id}&select=community_id,author_id,kind,result_event_id`);
  assert(
    row?.community_id === P && row.author_id === owner.id && row.kind === 'result' && row.result_event_id === events[0],
    `a result post in P, got ${JSON.stringify(row)}`,
  );
});

await run("an author can still delete their post, and an admin a member's comment and post", async () => {
  const [oops] = await as(author.jwt, '/rest/v1/community_posts', 'POST', { community_id: P, author_id: author.id, kind: 'user', body: 'Oops', image_path: null });
  assert((await as(author.jwt, `/rest/v1/community_posts?id=eq.${oops.id}`, 'DELETE')).length === 1, 'the author deleted their own post');
  assert((await as(owner.jwt, `/rest/v1/post_comments?id=eq.${comment.id}`, 'DELETE')).length === 1, "the admin deleted a member's comment");
  assert((await as(owner.jwt, `/rest/v1/community_posts?id=eq.${post.id}`, 'DELETE')).length === 1, "the admin deleted a member's post");
});

await run('a member can still write and edit their review, through upsert_community_review', async () => {
  await rpc(reviewer.jwt, 'upsert_community_review', { p_community_id: P, p_rating: 3, p_body: 'Changed my mind' });
  const rows = await sel('community_reviews', `community_id=eq.${P}&user_id=eq.${reviewer.id}&select=id,rating,body`);
  assert(
    rows.length === 1 && rows[0].id === review.id && rows[0].rating === 3 && rows[0].body === 'Changed my mind',
    `edited in place, got ${JSON.stringify(rows)}`,
  );
  // A first review goes through the same call.
  await rpc(author.jwt, 'upsert_community_review', { p_community_id: P, p_rating: 4, p_body: null });
  assert((await sel('community_reviews', `community_id=eq.${P}&user_id=eq.${author.id}&select=rating`))[0]?.rating === 4, 'first review written');
  // And the gate still holds where they have not played.
  await expectError(() => rpc(reviewer.jwt, 'upsert_community_review', { p_community_id: Q, p_rating: 5, p_body: null }), 'review_requires_participation');
});

await run("reads are unchanged: a signed-in non-member still reads a public community's feed", async () => {
  const rows = await req(`/rest/v1/community_posts?community_id=eq.${Q}&select=id`, { jwt: stranger.jwt });
  assert(rows.length === 1 && rows[0].id === qPost.id, `reads it, got ${JSON.stringify(rows)}`);
});
