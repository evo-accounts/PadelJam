// infra/supabase/tests/block-symmetry.test.mjs
// Migration 0140: a block hides each person from the other, whoever placed it, and neither can
// follow the other. Organizers and admins are included: the emailed roster CSV, the requests screen,
// the organizer's activity feed and a player's recent results do not name someone blocked with the
// viewer. Only block_user and unblock_user write `blocks`.
//
// Every read and write goes through PostgREST with a real user's JWT. The service key bypasses
// row-level security, so a test using it would pass whether or not the policy works; it is used here
// only to seed rows before a block exists and to look at what actually landed. The bug was in the
// direction a blocker never exercises (the BLOCKED person reading or following the blocker), so
// every "cannot" below runs as the blocked person and pairs with a "can" for a bystander who is part
// of no block.
import { user, rpc, anonRpc, req, sel, insert, patch, expectError, assert, run, BASE_URL, ANON } from './lib.mjs';

const block   = (u, target) => rpc(u.jwt, 'block_user',   { p_target: target });
const unblock = (u, target) => rpc(u.jwt, 'unblock_user', { p_target: target });
// Seeded with the service key, before any block exists. block_user strips edges between the two
// people, so follows involving only one side of the block have to be in place first.
const follow  = (u, target) => insert('follows', { follower_id: u.id, followee_id: target });
/** A direct table read as `u`, exactly what supabase-js sends. */
const asUser  = (u, table, qs) => req(`/rest/v1/${table}?${qs}`, { jwt: u.jwt });
/** useFollow / useUnfollow: a direct insert or delete of the caller's own edge. */
const directFollow   = (u, target) => req('/rest/v1/follows', {
  method: 'POST', jwt: u.jwt, body: { follower_id: u.id, followee_id: target }, prefer: 'return=minimal',
});
const directUnfollow = (u, target) => req(`/rest/v1/follows?follower_id=eq.${u.id}&followee_id=eq.${target}`, {
  method: 'DELETE', jwt: u.jwt,
});
/** What is really in the table, read with the service key. */
const edge = async (from, to) => (await sel('follows', `follower_id=eq.${from}&followee_id=eq.${to}&select=follower_id`)).length;
const RLS = 'row-level security';
/** A write the API must refuse: no privilege (42501 "permission denied") or a policy violation. */
async function expectRefused(fn, what) {
  try { await fn(); } catch (e) {
    if (/permission denied|row-level security/.test(String(e.message))) return;
    throw new Error(`${what}: expected a refusal, got: ${e.message}`);
  }
  throw new Error(`${what}: expected a refusal, but the write succeeded`);
}
const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
/** A standalone (so private) event `org` organizes, written with the service role. */
async function eventOf(org, { startsInHours = 72, status = 'scheduled' } = {}) {
  const [ev] = await insert('events', {
    organizer_id: org.id, name: `Blocks ${Date.now().toString(36)}`, event_type: 'americano', specification: 'classic',
    scoring_mode: 'points', num_courts: 1, duration_minutes: 90, organizer_role: 'organizing_only',
    starts_at: hoursFromNow(startsInHours), status, is_private: true,
  });
  return ev.id;
}
/** A confirmed roster row, written with the service role (no session, so no activity entry). */
const participant = async (ev, u) => (await insert('event_participants', { event_id: ev, user_id: u.id, status: 'confirmed' }))[0].id;

await run('profiles: the person I blocked cannot read my row either', async () => {
  const tag = Date.now().toString(36);
  const [alice, bob, eva] = await Promise.all([
    user('bs-a', { name: `Blocker ${tag}` }), user('bs-b'), user('bs-e'),
  ]);

  // Before the block, everyone reads everyone.
  assert((await asUser(bob, 'profiles', `id=eq.${alice.id}&select=id`)).length === 1, 'readable before the block');

  await block(alice, bob.id);

  // CANNOT: Bob was blocked by Alice. Before 0140 this returned Alice's full row, because the
  // policy's blocks subquery ran under Bob's RLS and never saw a block Bob had not placed.
  assert((await asUser(bob, 'profiles', `id=eq.${alice.id}&select=id,full_name`)).length === 0,
    'the blocked person cannot read the blocker');
  // …and the invite picker's search (useSearchProfiles: a plain ilike) does not surface her.
  assert((await asUser(bob, 'profiles', `full_name=ilike.*Blocker%20${tag}*&select=id`)).length === 0,
    "the blocker does not appear in the blocked person's search");
  // The half that always worked still works.
  assert((await asUser(alice, 'profiles', `id=eq.${bob.id}&select=id`)).length === 0,
    'the blocker cannot read the person they blocked');

  // CAN: a bystander is unaffected, in both lookups.
  assert((await asUser(eva, 'profiles', `id=eq.${alice.id}&select=id`)).length === 1, 'a bystander reads the blocker');
  assert((await asUser(eva, 'profiles', `full_name=ilike.*Blocker%20${tag}*&select=id`)).length === 1,
    'a bystander finds the blocker by name');
  assert((await asUser(eva, 'profiles', `id=eq.${bob.id}&select=id`)).length === 1, 'a bystander reads the blocked person');
  // CAN: both parties still read their own row, and everyone else's.
  assert((await asUser(bob, 'profiles', `id=eq.${bob.id}&select=id`)).length === 1, 'the blocked person reads their own row');
  assert((await asUser(bob, 'profiles', `id=eq.${eva.id}&select=id`)).length === 1, 'the blocked person reads a bystander');
  assert((await asUser(alice, 'profiles', `id=eq.${alice.id}&select=id`)).length === 1, 'the blocker reads their own row');

  // Unblocking restores both directions.
  await unblock(alice, bob.id);
  assert((await asUser(bob, 'profiles', `id=eq.${alice.id}&select=id`)).length === 1, 'unblock restores the blocked side');
  assert((await asUser(alice, 'profiles', `id=eq.${bob.id}&select=id`)).length === 1, 'unblock restores the blocker side');
});

await run('list_followers / list_following: nothing for someone blocked either way', async () => {
  const [alice, bob, carol, dave, eva] = await Promise.all([
    user('bsl-a'), user('bsl-b'), user('bsl-c'), user('bsl-d'), user('bsl-e'),
  ]);
  await follow(carol, alice.id); // Alice's follower
  await follow(alice, dave.id);  // whom Alice follows
  await follow(bob, carol.id);   // Bob's own graph, untouched by the block
  await block(alice, bob.id);

  // CANNOT: Bob, blocked by Alice, lists Alice's graph. Before 0140 both returned rows.
  assert((await rpc(bob.jwt, 'list_followers', { p_user: alice.id })).length === 0, 'blocked: no followers list');
  assert((await rpc(bob.jwt, 'list_following', { p_user: alice.id })).length === 0, 'blocked: no following list');
  // Same answer as the profile itself, so the screen never shows a list behind "no access".
  assert((await rpc(bob.jwt, 'get_player_profile', { p_target: alice.id })).length === 0, 'blocked: no profile');
  // CANNOT, the other way: the blocker does not list the blocked person's graph either.
  assert((await rpc(alice.jwt, 'list_following', { p_user: bob.id })).length === 0, 'blocker: no list of the blocked');

  // CAN: a bystander sees both lists in full.
  const evaFollowers = await rpc(eva.jwt, 'list_followers', { p_user: alice.id });
  assert(evaFollowers.length === 1 && evaFollowers[0].id === carol.id, "a bystander lists Alice's follower");
  const evaFollowing = await rpc(eva.jwt, 'list_following', { p_user: alice.id });
  assert(evaFollowing.length === 1 && evaFollowing[0].id === dave.id, 'a bystander lists whom Alice follows');
  // CAN: each party's own lists, and Bob's view of an unrelated person's list.
  assert((await rpc(alice.jwt, 'list_followers', { p_user: alice.id })).some((r) => r.id === carol.id), 'the blocker lists their own followers');
  assert((await rpc(bob.jwt, 'list_following', { p_user: bob.id })).some((r) => r.id === carol.id), 'the blocked person lists their own following');
  assert((await rpc(bob.jwt, 'list_followers', { p_user: carol.id })).some((r) => r.id === bob.id), "the blocked person lists Carol's followers");

  await unblock(alice, bob.id);
  assert((await rpc(bob.jwt, 'list_followers', { p_user: alice.id })).some((r) => r.id === carol.id), 'unblock restores the list');
});

await run("follows: the blocked person cannot read the blocker's edges directly", async () => {
  const [alice, bob, carol, dave, eva] = await Promise.all([
    user('bsf-a'), user('bsf-b'), user('bsf-c'), user('bsf-d'), user('bsf-e'),
  ]);
  await follow(carol, alice.id);
  await follow(alice, dave.id);
  await follow(bob, carol.id);
  await block(alice, bob.id);

  const touching = (id) => `or=(follower_id.eq.${id},followee_id.eq.${id})&select=follower_id,followee_id`;

  // CANNOT: with only the RPC fixed, this direct read would hand Bob the same graph.
  assert((await asUser(bob, 'follows', touching(alice.id))).length === 0, "the blocked person reads none of Alice's edges");
  assert((await asUser(alice, 'follows', touching(bob.id))).length === 0, "the blocker reads none of Bob's edges");

  // CAN: a bystander reads every edge; Bob still reads his own.
  assert((await asUser(eva, 'follows', touching(alice.id))).length === 2, "a bystander reads both of Alice's edges");
  assert((await asUser(bob, 'follows', `follower_id=eq.${bob.id}&select=followee_id`)).length === 1, 'the blocked person reads their own edge');
  // CAN: follow and unfollow, the way useFollow / useUnfollow send them.
  await directFollow(eva, alice.id);
  assert((await asUser(eva, 'follows', `follower_id=eq.${eva.id}&followee_id=eq.${alice.id}&select=followee_id`)).length === 1, 'a bystander follows');
  await directUnfollow(eva, alice.id);
  assert((await asUser(eva, 'follows', `follower_id=eq.${eva.id}&followee_id=eq.${alice.id}&select=followee_id`)).length === 0, 'a bystander unfollows');
});

await run('follows: neither side of a block can follow the other with a direct insert', async () => {
  const [alice, bob, eva] = await Promise.all([user('bsi-a'), user('bsi-b'), user('bsi-e')]);
  await block(alice, bob.id);

  // CANNOT: Bob, blocked by Alice, follows her the way useFollow does — a direct insert, not
  // follow_player. Before 0140 the edge landed: it counted in Alice's followers_count and showed
  // Bob in list_followers(Alice) to everyone else.
  await expectError(() => directFollow(bob, alice.id), RLS);
  assert((await edge(bob.id, alice.id)) === 0, 'no edge from the blocked person to the blocker');
  // CANNOT: nor the other way round.
  await expectError(() => directFollow(alice, bob.id), RLS);
  assert((await edge(alice.id, bob.id)) === 0, 'no edge from the blocker to the blocked person');
  // follow_player already refused both directions, and still does.
  await expectError(() => rpc(bob.jwt, 'follow_player', { p_user: alice.id }), 'blocked');
  // A bystander still sees no Bob among Alice's followers, and her count is unchanged.
  assert(!(await rpc(eva.jwt, 'list_followers', { p_user: alice.id })).some((r) => r.id === bob.id), 'no ghost follower for bystanders');
  const [card] = await rpc(eva.jwt, 'get_player_profile', { p_target: alice.id });
  assert(Number(card.followers_count) === 0, `followers_count stays 0, got ${card.followers_count}`);

  // CAN: everyone else still follows directly, the blocked person included (of a third party).
  await directFollow(eva, alice.id);
  assert((await edge(eva.id, alice.id)) === 1, 'a bystander follows the blocker');
  await directFollow(bob, eva.id);
  assert((await edge(bob.id, eva.id)) === 1, 'the blocked person follows a bystander');

  // CANNOT: anon, as before — TO authenticated opened nothing.
  const res = await fetch(`${BASE_URL}/rest/v1/follows`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ follower_id: eva.id, followee_id: bob.id }),
  });
  const text = await res.text();
  assert(!res.ok && text.includes(RLS), `anon cannot insert a follow (got ${res.status}: ${text.slice(0, 200)})`);
  assert((await edge(eva.id, bob.id)) === 0, 'no edge from the anon attempt');

  // Unblocking lets them follow each other again.
  await unblock(alice, bob.id);
  await directFollow(bob, alice.id);
  assert((await edge(bob.id, alice.id)) === 1, 'unblock allows the direct follow again');
});

await run('is_blocked_with is caller-relative, and anon is untouched', async () => {
  const [alice, bob, eva] = await Promise.all([user('bsh-a'), user('bsh-b'), user('bsh-e')]);
  await block(alice, bob.id);

  // CAN: each party learns only what get_player_profile already told them.
  assert((await rpc(bob.jwt, 'is_blocked_with', { p_other: alice.id })) === true, 'the blocked person: true');
  assert((await rpc(alice.jwt, 'is_blocked_with', { p_other: bob.id })) === true, 'the blocker: true');
  // CANNOT: a third person cannot probe somebody else's block. It takes one id, never two.
  assert((await rpc(eva.jwt, 'is_blocked_with', { p_other: alice.id })) === false, 'a bystander learns nothing about Alice');
  assert((await rpc(eva.jwt, 'is_blocked_with', { p_other: bob.id })) === false, 'a bystander learns nothing about Bob');
  // CANNOT: anon does not get the helper.
  await expectError(() => anonRpc('is_blocked_with', { p_other: alice.id }), 'permission denied for function');

  // CAN: anon still reads profiles and follows without an error, and still gets nothing. If the
  // policies applied to every role, Postgres would check EXECUTE on the helper for anon too and
  // this would be a 401 "permission denied for function is_blocked_with" instead of [].
  // `select=id` / explicit columns: 0115 and 0119 withhold email and phone from every client role,
  // so `select=*` on profiles is refused for a reason unrelated to this file.
  for (const [table, cols] of [['profiles', 'id,full_name'], ['follows', 'follower_id,followee_id']]) {
    const res = await fetch(`${BASE_URL}/rest/v1/${table}?select=${cols}&limit=5`, { headers: { apikey: ANON } });
    const text = await res.text();
    assert(res.ok, `anon read of ${table} succeeds (got ${res.status}: ${text.slice(0, 200)})`);
    assert(JSON.parse(text).length === 0, `anon still sees no ${table} rows`);
  }
});

await run('blocks: block_user and unblock_user are the only way to write a block', async () => {
  const [alice, bob, eva] = await Promise.all([user('bsw-a'), user('bsw-b'), user('bsw-e')]);
  await follow(bob, alice.id); // both legitimate, before any block
  await follow(alice, bob.id);
  /** What is really in the table, read with the service key. */
  const blocksOf = (u) => sel('blocks', `blocker_id=eq.${u.id}&select=blocked_id`);
  const direct = (u, method, qs, body) => req(`/rest/v1/blocks${qs}`, { method, jwt: u.jwt, body, prefer: 'return=minimal' });

  // CANNOT: a direct insert. Before 0140 "blocks: all" let it through, skipping block_user's follow
  // delete: the B→A edge survived, counted in Alice's followers_count, and neither side could see it.
  await expectRefused(() => direct(bob, 'POST', '', { blocker_id: bob.id, blocked_id: alice.id }), 'direct insert');
  assert((await blocksOf(bob)).length === 0, 'no block landed');
  assert((await edge(bob.id, alice.id)) === 1 && (await edge(alice.id, bob.id)) === 1, 'both legitimate edges untouched');

  // CAN: block_user, which removes the edges both ways (social_graph.sql checks the same as owner).
  await block(bob, alice.id);
  assert((await edge(bob.id, alice.id)) === 0 && (await edge(alice.id, bob.id)) === 0, 'block_user removed both edges');
  // The blocker still reads the block they placed; the blocked person reads none.
  const own = await asUser(bob, 'blocks', 'select=blocked_id');
  assert(own.length === 1 && own[0].blocked_id === alice.id, 'the blocker reads their own block');
  assert((await asUser(alice, 'blocks', 'select=blocker_id')).length === 0, 'the blocked person reads no block');

  // CANNOT: change or remove it directly either; unblock_user is the way out.
  await expectRefused(() => direct(bob, 'PATCH', `?blocker_id=eq.${bob.id}`, { blocked_id: eva.id }), 'direct update');
  await expectRefused(() => direct(bob, 'DELETE', `?blocker_id=eq.${bob.id}`), 'direct delete');
  const still = await blocksOf(bob);
  assert(still.length === 1 && still[0].blocked_id === alice.id, 'the block is unchanged');
  await unblock(bob, alice.id);
  assert((await blocksOf(bob)).length === 0, 'unblock_user removed it');

  // anon: reads nothing without an error, and writes nothing.
  const read = await fetch(`${BASE_URL}/rest/v1/blocks?select=blocker_id&limit=5`, { headers: { apikey: ANON } });
  const readText = await read.text();
  assert(read.ok && JSON.parse(readText).length === 0, `anon reads no blocks, without an error (got ${read.status}: ${readText.slice(0, 200)})`);
  const write = await fetch(`${BASE_URL}/rest/v1/blocks`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ blocker_id: eva.id, blocked_id: bob.id }),
  });
  const writeText = await write.text();
  assert(!write.ok && /permission denied|row-level security/.test(writeText),
    `anon cannot insert a block (got ${write.status}: ${writeText.slice(0, 200)})`);
  assert((await blocksOf(eva)).length === 0, 'no block from the anon attempt');
});

await run('event_roster_csv: no name for a participant blocked with the organizer, either way', async () => {
  const t = Date.now().toString(36);
  const [olga, rita, ned] = await Promise.all([
    user('bsc-o'), user('bsc-r', { name: `Rita ${t}` }), user('bsc-n', { name: `Ned ${t}` }),
  ]);
  const ev = await eventOf(olga);
  await participant(ev, rita);
  await participant(ev, ned);
  /** "Email CSV to me": send-roster-csv calls this with the organizer's JWT. */
  const csv = () => rpc(olga.jwt, 'event_roster_csv', { p_event_id: ev });
  assert((await csv()).includes(`Rita ${t}`), 'named before the block');

  // CANNOT: Rita blocked the organizer. Before 0140 the emailed CSV still named her, although the
  // roster embed (and so the downloaded CSV, buildRosterCsv) did not.
  await block(rita, olga.id);
  let out = await csv();
  assert(!out.includes(`Rita ${t}`), 'the participant who blocked the organizer is not named');
  // …but her row is still there, nameless, which is what buildRosterCsv writes for her.
  const lines = out.split('\n');
  assert(lines.length === 3 && lines.some((l) => l.startsWith(',member,confirmed,')),
    `two rows, one of them nameless (${JSON.stringify(lines)})`);
  // CAN: everyone else is named.
  assert(out.includes(`Ned ${t}`), 'an unblocked participant is still named');

  // Unblocking restores the name; the organizer's own block hides one too.
  await unblock(rita, olga.id);
  await block(olga, ned.id);
  out = await csv();
  assert(out.includes(`Rita ${t}`), 'unblock restores the name');
  assert(!out.includes(`Ned ${t}`), 'a participant the organizer blocked is not named either');
});

await run('incoming_partner_requests: no name or avatar for a requester blocked with me, and the request stays', async () => {
  const t = Date.now().toString(36);
  const [olga, rita, ned, tom] = await Promise.all([
    user('bsr-o'), user('bsr-r', { name: `Rita ${t}` }), user('bsr-n', { name: `Ned ${t}` }), user('bsr-t', { name: `Tom ${t}` }),
  ]);
  // An avatar of her own (0131: "<her id>/<file>"), so the avatar half is tested too.
  await patch('profiles', `id=eq.${rita.id}`, { avatar_url: `${rita.id}/a.png` });
  const cid = await rpc(olga.jwt, 'create_community_with_personal_tenant', {
    p_name: `Requests ${t}`, p_type: 'club', p_country: 'PT', p_privacy: 'request_to_join',
  });
  for (const u of [rita, ned]) {
    assert((await rpc(u.jwt, 'join_community', { p_community_id: cid })) === 'requested', 'a join request');
  }
  /** The notifications' requests screen (both clients). */
  const requests = (kind) => rpc(olga.jwt, 'incoming_partner_requests').then((rows) => rows.filter((r) => r.kind === kind));
  const of = (rows, u) => rows.find((r) => r.requester_id === u.id);
  let rows = await requests('community');
  assert(of(rows, rita)?.requester_name === `Rita ${t}` && of(rows, rita)?.requester_avatar === `${rita.id}/a.png`,
    'named, with her avatar, before the block');

  // CANNOT: Rita blocks the admin after asking, and Tom blocks her before asking (join_community
  // still answers 'requested'). Before 0140 both came back named here, while the manage-requests
  // embed already showed them nameless.
  await block(rita, olga.id);
  await block(tom, olga.id);
  assert((await rpc(tom.jwt, 'join_community', { p_community_id: cid })) === 'requested', 'a blocked requester can still ask');
  rows = await requests('community');
  for (const u of [rita, tom]) {
    const r = of(rows, u);
    assert(r && r.requester_name === null && r.requester_avatar === null, `nameless, avatar-less, still listed (${JSON.stringify(r)})`);
  }
  // CAN: an unblocked requester is named, and the admin can still answer a nameless row.
  assert(of(rows, ned)?.requester_name === `Ned ${t}`, 'an unblocked requester is still named');
  await rpc(olga.jwt, 'decline_join_request', { p_request_id: of(rows, tom).request_id });
  assert(!of(await requests('community'), tom), 'the nameless request was answered');

  // The event branch: a partner request left pending from before a block (block_user does not close it).
  const ev = await eventOf(ned);
  await insert('partner_requests', { event_id: ev, requester_id: rita.id, target_id: olga.id, status: 'pending' });
  const evRow = of(await requests('event'), rita);
  assert(evRow && evRow.requester_name === null && evRow.requester_avatar === null,
    `a partner request: nameless, avatar-less, still listed (${JSON.stringify(evRow)})`);
});

await run("activity: the organizer's feed does not name a player blocked with the organizer", async () => {
  const t = Date.now().toString(36);
  const [olga, rita, ned, tom, sam] = await Promise.all([
    user('bsa-o'), user('bsa-r', { name: `Rita ${t}` }), user('bsa-n', { name: `Ned ${t}` }),
    user('bsa-t', { name: `Tom ${t}` }), user('bsa-s', { name: `Sam ${t}` }),
  ]);
  const ev = await eventOf(olga);
  const pRita = await participant(ev, rita);
  const pNed = await participant(ev, ned);
  // Invitations sent before anyone blocked: their 'invited' entries keep the names they were written with.
  await insert('event_invitations', [
    { event_id: ev, invitee_id: tom.id, invited_by: olga.id, status: 'pending' },
    { event_id: ev, invitee_id: sam.id, invited_by: olga.id, status: 'pending' },
  ]);
  const [samInvitation] = await sel('event_invitations', `event_id=eq.${ev}&invitee_id=eq.${sam.id}&select=id`);
  for (const u of [rita, tom, sam]) await block(u, olga.id);

  // The organizer's own roster actions (_participant_label, organizer_revoke_invitation)…
  await rpc(olga.jwt, 'mark_paid', { p_participant_id: pRita, p_paid: true });
  await rpc(olga.jwt, 'mark_paid', { p_participant_id: pNed, p_paid: true });
  await rpc(olga.jwt, 'organizer_revoke_invitation', { p_event_id: ev, p_invitation_id: samInvitation.id });
  // …and the players' own (the activity triggers).
  await rpc(tom.jwt, 'decline_event_invitation', { p_event_id: ev });
  await rpc(rita.jwt, 'leave_event', { p_event_id: ev });
  await rpc(ned.jwt, 'leave_event', { p_event_id: ev });
  // A partner request naming Rita as its target.
  await insert('partner_requests', { event_id: ev, requester_id: ned.id, target_id: rita.id, status: 'pending' });

  // What useEventActivity reads: the rows themselves ("activity: read" is the organizer's).
  const feed = await asUser(olga, 'event_activity', `event_id=eq.${ev}&select=action,detail`);
  const entries = (action) => feed.filter((r) => r.action === action);
  const naming = (who) => feed.filter((r) => JSON.stringify(r.detail ?? {}).includes(who));
  for (const [action, n] of [['marked_paid', 2], ['removed', 1], ['invite_declined', 1], ['left', 2], ['partner_invite_sent', 1]]) {
    assert(entries(action).length === n, `${n} × ${action} (${JSON.stringify(feed)})`);
  }
  // CANNOT: before 0140 every one of these entries carried the blocked player's name.
  assert(naming(`Rita ${t}`).length === 0, `Rita is named nowhere (${JSON.stringify(naming(`Rita ${t}`))})`);
  for (const who of [`Tom ${t}`, `Sam ${t}`]) {
    const after = naming(who).filter((r) => r.action !== 'invited');
    assert(after.length === 0, `${who} is named only by the invitation sent before the block (${JSON.stringify(after)})`);
  }
  // CAN: the unblocked player is named on every entry about him…
  assert(entries('marked_paid').some((r) => r.detail.target_name === `Ned ${t}`), 'marked_paid names Ned');
  assert(entries('left').some((r) => r.detail.target_name === `Ned ${t}`), 'left names Ned');
  // …and an entry written before a block keeps its name, as notifications.actor_name does.
  assert(entries('invited').some((r) => r.detail.target_name === `Tom ${t}`), 'the earlier invitation keeps its name');
});

await run('player_recent_results: a co-player blocked with the viewer reads —', async () => {
  const t = Date.now().toString(36);
  const [olga, alice, bob, carl, dana] = await Promise.all([
    user('bsp-o'), user('bsp-a', { name: `Alice ${t}` }), user('bsp-b', { name: `Bob ${t}` }),
    user('bsp-c', { name: `Carl ${t}` }), user('bsp-d', { name: `Dana ${t}` }),
  ]);
  // One played match, (Alice, Bob) 16-8 (Carl, Dana). Every viewer below played in it, so
  // event_is_visible admits them.
  const ev = await eventOf(olga, { startsInHours: -48, status: 'in_progress' });
  const [pa, pb, pc, pd] = await Promise.all([alice, bob, carl, dana].map((u) => participant(ev, u)));
  const [round] = await insert('event_rounds', { event_id: ev, round_number: 1, status: 'completed' });
  const [match] = await insert('event_matches', {
    event_id: ev, round_id: round.id, court_number: 1, match_number: 1,
    side_a_score: 16, side_b_score: 8, status: 'played', submitted_at: new Date().toISOString(),
  });
  await insert('match_players', [
    { match_id: match.id, participant_id: pa, side: 'a' }, { match_id: match.id, participant_id: pb, side: 'a' },
    { match_id: match.id, participant_id: pc, side: 'b' }, { match_id: match.id, participant_id: pd, side: 'b' },
  ]);
  await patch('events', `id=eq.${ev}`, { status: 'completed' });
  /** Bob's profile, ProfileResults, as `viewer` sees it. */
  const sides = async (viewer) => {
    const rows = await rpc(viewer.jwt, 'player_recent_results', { p_user: bob.id });
    assert(rows.length === 1, `one match (${JSON.stringify(rows)})`);
    return JSON.stringify([rows[0].side_a_names, rows[0].side_b_names]);
  };
  const named = JSON.stringify([[`Alice ${t}`, `Bob ${t}`], [`Carl ${t}`, `Dana ${t}`]]);
  assert((await sides(alice)) === named, 'every name before the block');

  await block(dana, alice.id);
  // CANNOT: Dana blocked Alice. Before 0140 Bob's recent results still named Dana to Alice, while
  // event_result_summary (0139) already read '—' for the same match.
  const got = await sides(alice);
  assert(got === JSON.stringify([[`Alice ${t}`, `Bob ${t}`], [`Carl ${t}`, '—']]), `Dana reads — and sorts last, got ${got}`);
  // Unchanged: Dana's own results stay closed to Alice.
  assert((await rpc(alice.jwt, 'player_recent_results', { p_user: dana.id })).length === 0, "the blocker's own results stay hidden");
  // CAN: a viewer outside the block still reads every name.
  assert((await sides(carl)) === named, 'a bystander reads Dana');

  // The viewer's own block hides a co-player too, and unblocking restores the name.
  await unblock(dana, alice.id);
  await block(alice, carl.id);
  const mine = await sides(alice);
  assert(mine === JSON.stringify([[`Alice ${t}`, `Bob ${t}`], [`Dana ${t}`, '—']]), `the viewer blocking Carl hides him, got ${mine}`);
});

console.log('\nall block-symmetry checks passed');
