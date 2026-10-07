// infra/supabase/tests/event-result-visibility.test.mjs
//
// Migration 0139 — an event's result goes only to people who may see the event: anyone
// event_is_visible() admits, its organizer, and members of the community the organizer POSTED the
// result to (post_event_result). A blocked player's name reads '—' for every viewer, the organizer's
// share card included. Through PostgREST with real user JWTs: standings and event_result_summary are
// SECURITY DEFINER, so the rule written into their bodies is the only fence, and the service key
// would walk straight past it. The roster and scored matches are written with the service role —
// the round engine is not what is under test.
//
// 0139 applies after 0137 (community content stays put). The posted-result rule trusts a result post
// only when the organizer wrote it, which holds because nobody can UPDATE a post any more (0137) and
// "posts: create" pins author_id to the caller. The admin re-sign test below keeps that from
// reopening if an "edit post" grant ever comes back. Two tests cover rows written before 0137: the
// planted-row test (any member could insert kind = 'result' with any event's id) and the
// rewritten-row test (an admin could re-sign their own post as the organizer's result post; only its
// later updated_at gives it away).
import { user, rpc, anonRpc, req, sel, insert, patch, expectError, assert, run } from './lib.mjs';

const DENIED = 'permission denied for function';
const ZERO = '00000000-0000-0000-0000-000000000000';
const tag = () => Math.random().toString(36).slice(2, 8);
const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const byRank = (rows) => [...rows].sort((x, y) => x.rank - y.rank);
const names = (rows) => rows.map((r) => r.name);

/** A write the API must refuse: no privilege (42501 "permission denied") or a policy violation. */
async function expectRefused(fn, what) {
  try { await fn(); } catch (e) {
    if (/permission denied|row-level security/.test(String(e.message))) return;
    throw new Error(`${what}: expected a refusal, got: ${e.message}`);
  }
  throw new Error(`${what}: expected a refusal, but the write succeeded`);
}

/** A public community on Pro with a PRIVATE group "Squad" the four players are in. `member` is in
 *  the community only (not the Squad, not playing); `admin` is a community admin who is not in the
 *  Squad and organizes nothing; `outsider` is in nothing. Members may post, so `member` can try to
 *  forge a result post. */
async function world(t) {
  const org = await user(`${t}-org`);
  const players = [];
  for (const n of ['a', 'b', 'c', 'd']) players.push(await user(`${t}-${n}`, { name: `${t} ${n.toUpperCase()}` }));
  const member = await user(`${t}-mem`);
  const admin = await user(`${t}-adm`);
  const outsider = await user(`${t}-out`);
  const communityId = await rpc(org.jwt, 'create_community_with_personal_tenant', {
    p_name: `Results ${t} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  await patch('community_permissions', `community_id=eq.${communityId}`, { create_posts: true });
  const squadId = await rpc(org.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Squad', p_description: null, p_is_private: true, p_thumbnail_path: null,
  });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  for (const u of [...players, member]) await insert('community_members', { community_id: communityId, user_id: u.id, role: 'member' });
  await insert('community_members', { community_id: communityId, user_id: admin.id, role: 'admin' });
  for (const u of players) await insert('group_members', { group_id: squadId, user_id: u.id });
  return { org, players, member, admin, outsider, communityId, squadId, generalId: general.id };
}

/** A completed classic Americano, the four players, two scored rounds:
 *  (A,B) 16-8 (C,D); (A,C) 10-14 (B,D)  =>  B 30, A 26, D 22, C 18. */
async function playedEvent(w, { groupId, isPrivate }) {
  const [ev] = await insert('events', {
    group_id: groupId, organizer_id: w.org.id, event_type: 'americano', specification: 'classic',
    scoring_mode: 'points', num_courts: 1, starts_at: hoursFromNow(-48), duration_minutes: 90,
    organizer_role: 'organizing_only', name: `Result ${tag()}`, status: 'in_progress', is_private: isPrivate,
  });
  const pids = [];
  for (const p of w.players) {
    const [r] = await insert('event_participants', { event_id: ev.id, user_id: p.id, status: 'confirmed' });
    pids.push(r.id);
  }
  const [a, b, c, d] = pids;
  for (const [i, [sideA, sideB, sa, sb]] of [[[a, b], [c, d], 16, 8], [[a, c], [b, d], 10, 14]].entries()) {
    const [round] = await insert('event_rounds', { event_id: ev.id, round_number: i + 1, status: 'completed' });
    const [m] = await insert('event_matches', {
      event_id: ev.id, round_id: round.id, court_number: 1, match_number: 1,
      side_a_score: sa, side_b_score: sb, status: 'played',
    });
    await insert('match_players', [
      ...sideA.map((pid) => ({ match_id: m.id, participant_id: pid, side: 'a' })),
      ...sideB.map((pid) => ({ match_id: m.id, participant_id: pid, side: 'b' })),
    ]);
  }
  await patch('events', `id=eq.${ev.id}`, { status: 'completed' });
  return ev.id;
}

await run('0139: standings — a signed-in stranger gets no rows for a private event; its organizer and players still do', async () => {
  const t = `rv${tag()}`;
  const w = await world(t);
  const ev = await playedEvent(w, { groupId: w.squadId, isPrivate: true });
  // cannot
  assert((await rpc(w.outsider.jwt, 'standings', { p_event_id: ev })).length === 0, 'outsider: no score rows');
  assert((await rpc(w.member.jwt, 'standings', { p_event_id: ev })).length === 0, 'community member outside the Squad: no score rows');
  // can
  const asOrg = byRank(await rpc(w.org.jwt, 'standings', { p_event_id: ev }));
  assert(asOrg.length === 4 && asOrg[0].points === 30 && asOrg[0].name_a === `${t} B`, `organizer: the full table, named (${JSON.stringify(asOrg[0])})`);
  const asPlayer = byRank(await rpc(w.players[0].jwt, 'standings', { p_event_id: ev }));
  assert(asPlayer.length === 4 && asPlayer[1].name_a === `${t} A` && asPlayer[1].user_a_id === w.players[0].id, 'a player: the full table, named');
});

await run('0139: summary — a community member cannot read an unposted private event; a player can', async () => {
  const t = `rv${tag()}`;
  const w = await world(t);
  const ev = await playedEvent(w, { groupId: w.squadId, isPrivate: true });
  // cannot
  assert((await rpc(w.member.jwt, 'event_result_summary', { p_event_id: ev })).length === 0, 'community member: nothing (was every name)');
  assert((await rpc(w.outsider.jwt, 'event_result_summary', { p_event_id: ev })).length === 0, 'outsider: nothing');
  // can
  const s = await rpc(w.players[0].jwt, 'event_result_summary', { p_event_id: ev });
  assert(JSON.stringify(names(s)) === JSON.stringify([`${t} B`, `${t} A`, `${t} D`, `${t} C`]), `a player: ranked names, got ${JSON.stringify(s)}`);
  assert(s[0].rank === 1 && s[0].points === 30, 'ranks and points unchanged');
});

await run('0139: a POSTED result reaches every community member by name; their standings rows carry no identities', async () => {
  const t = `rv${tag()}`;
  const w = await world(t);
  const ev = await playedEvent(w, { groupId: w.squadId, isPrivate: true });
  await rpc(w.org.jwt, 'post_event_result', { p_event_id: ev });
  // can (the PostCard path) — product call: a posted result stays visible outside a private group
  const s = await rpc(w.member.jwt, 'event_result_summary', { p_event_id: ev });
  assert(JSON.stringify(names(s)) === JSON.stringify([`${t} B`, `${t} A`, `${t} D`, `${t} C`]), `member: the posted ranking, named, got ${JSON.stringify(s)}`);
  const st = await rpc(w.member.jwt, 'standings', { p_event_id: ev });
  assert(st.length === 4 && st.every((r) => r.user_a_id === null && r.name_a === null), 'member: score rows of a posted result, identities still masked');
  // cannot
  assert((await rpc(w.outsider.jwt, 'event_result_summary', { p_event_id: ev })).length === 0, 'a non-member still reads nothing');
  assert((await rpc(w.outsider.jwt, 'standings', { p_event_id: ev })).length === 0, 'nor any score rows');
});

await run('0139: only a result post its organizer wrote, in the event\'s own community, counts as posted', async () => {
  const t = `rv${tag()}`;
  const w = await world(t);
  const ev = await playedEvent(w, { groupId: w.squadId, isPrivate: true });
  const post = (author) => req('/rest/v1/community_posts', {
    method: 'POST', jwt: w.member.jwt, prefer: 'return=minimal',
    body: { community_id: w.communityId, author_id: author, kind: 'result', result_event_id: ev },
  });
  // cannot — write a result post at all, as themselves or as the organizer (0137: no INSERT on
  // result_event_id, and "posts: create" wants kind = 'user' and the caller as author)
  await expectRefused(() => post(w.member.id), 'member result post as themselves');
  await expectRefused(() => post(w.org.id), 'member result post signed as the organizer');
  // A row planted before 0137 is still in the table: written here with the service key, as the
  // old policy allowed. It is not the organizer's, so it unlocks nothing.
  await insert('community_posts', { community_id: w.communityId, author_id: w.member.id, kind: 'result', result_event_id: ev });
  assert((await rpc(w.member.jwt, 'event_result_summary', { p_event_id: ev })).length === 0, 'a planted post unlocks no summary');
  assert((await rpc(w.member.jwt, 'standings', { p_event_id: ev })).length === 0, 'nor standings');
  // An organizer-signed result row in ANOTHER community (service key again) is not "posted to"
  // that community either: its members get no score rows.
  const otherId = await rpc(w.outsider.jwt, 'create_community_with_personal_tenant', {
    p_name: `Elsewhere ${t} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_posts', { community_id: otherId, author_id: w.org.id, kind: 'result', result_event_id: ev });
  assert((await rpc(w.outsider.jwt, 'standings', { p_event_id: ev })).length === 0, 'a result row in another community gives its members nothing');
  // can — the event's own players are unaffected by the stray rows
  assert((await rpc(w.players[2].jwt, 'event_result_summary', { p_event_id: ev })).length === 4, 'a player still reads the result');
});

await run('0139: a result post rewritten after it was written (a pre-0137 admin re-sign) unlocks nothing', async () => {
  const t = `rv${tag()}`;
  const w = await world(t);
  const ev = await playedEvent(w, { groupId: w.squadId, isPrivate: true });
  // Before 0137, "posts: update" let a community admin turn their own post into the organizer's
  // result post. Replayed here with the service key, which still has UPDATE: the admin's ordinary
  // post, then the rewrite in a LATER request, as a real re-sign always was. The row then matches
  // what post_event_result writes on kind, author, community and event; only its updated_at, which
  // trg_community_posts_updated_at moved, gives it away.
  const [post] = await insert('community_posts', { community_id: w.communityId, author_id: w.admin.id, kind: 'user', body: 'Weekly update' });
  await patch('community_posts', `id=eq.${post.id}`, { author_id: w.org.id, kind: 'result', result_event_id: ev, body: null });
  const [row] = await sel('community_posts', `id=eq.${post.id}&select=community_id,author_id,kind,result_event_id,created_at,updated_at`);
  assert(row.community_id === w.communityId && row.author_id === w.org.id && row.kind === 'result' && row.result_event_id === ev,
    `the rewritten row reads as the organizer's result post, got ${JSON.stringify(row)}`);
  // Compared as strings: they carry the microseconds, which Date.parse would drop.
  assert(row.updated_at !== row.created_at, `the rewrite moved updated_at, got ${JSON.stringify(row)}`);
  // cannot — nobody outside the Squad gains the names or the score rows
  assert((await rpc(w.member.jwt, 'event_result_summary', { p_event_id: ev })).length === 0, 'a plain member reads nothing');
  assert((await rpc(w.member.jwt, 'standings', { p_event_id: ev })).length === 0, 'nor any score rows');
  assert((await rpc(w.admin.jwt, 'event_result_summary', { p_event_id: ev })).length === 0, 'nor does the admin who rewrote it');
  // can — the players are unaffected
  assert((await rpc(w.players[1].jwt, 'event_result_summary', { p_event_id: ev })).length === 4, 'a player still reads the result');
});

await run('0139: a community admin cannot re-sign a post as the organizer (0137), so a private result stays private', async () => {
  const t = `rv${tag()}`;
  const w = await world(t);
  const ev = await playedEvent(w, { groupId: w.squadId, isPrivate: true });
  // The admin's own ordinary post — allowed.
  const [post] = await req('/rest/v1/community_posts', {
    method: 'POST', jwt: w.admin.jwt, prefer: 'return=representation',
    body: { community_id: w.communityId, author_id: w.admin.id, kind: 'user', body: 'Weekly update' },
  });
  const forged = { author_id: w.org.id, kind: 'result', result_event_id: ev };
  // cannot — PATCH it into the organizer's result post ("posts: update" allowed this before 0137,
  // and the whole community then read the private event's names)
  await expectRefused(() => req(`/rest/v1/community_posts?id=eq.${post.id}`, {
    method: 'PATCH', jwt: w.admin.jwt, prefer: 'return=minimal', body: forged,
  }), 'PATCH re-sign');
  // cannot — the same through an upsert (INSERT … ON CONFLICT DO UPDATE)
  await expectRefused(() => req('/rest/v1/community_posts', {
    method: 'POST', jwt: w.admin.jwt, prefer: 'resolution=merge-duplicates,return=minimal',
    body: { id: post.id, community_id: w.communityId, ...forged },
  }), 'upsert re-sign');
  // cannot — a new post signed as the organizer ("posts: create" pins author_id for admins too, and
  // 0137 keeps result_event_id out of every client INSERT)
  await expectRefused(() => req('/rest/v1/community_posts', {
    method: 'POST', jwt: w.admin.jwt, prefer: 'return=minimal', body: { community_id: w.communityId, ...forged },
  }), 'insert signed as the organizer');
  const [after] = await sel('community_posts', `id=eq.${post.id}&select=author_id,kind,result_event_id`);
  assert(after.author_id === w.admin.id && after.kind === 'user' && after.result_event_id === null,
    `the admin's post is unchanged, got ${JSON.stringify(after)}`);
  // so nobody outside the Squad gains the names
  assert((await rpc(w.member.jwt, 'event_result_summary', { p_event_id: ev })).length === 0, 'a plain member reads nothing');
  assert((await rpc(w.member.jwt, 'standings', { p_event_id: ev })).length === 0, 'nor any score rows');
  assert((await rpc(w.admin.jwt, 'event_result_summary', { p_event_id: ev })).length === 0, 'nor does the admin');
});

await run('0139: a blocked player reads "—" in the summary, on the organizer\'s share card too; everyone else still sees the name', async () => {
  const t = `rv${tag()}`;
  const w = await world(t);
  // A public event in the general group of a public community: every signed-in member sees it.
  const ev = await playedEvent(w, { groupId: w.generalId, isPrivate: false });
  await insert('blocks', { blocker_id: w.players[0].id, blocked_id: w.member.id }); // A blocked the member
  await insert('blocks', { blocker_id: w.players[3].id, blocked_id: w.org.id });    // D blocked the organizer
  // cannot — the name of someone who blocked you
  const seen = await rpc(w.member.jwt, 'event_result_summary', { p_event_id: ev });
  assert(JSON.stringify(names(seen)) === JSON.stringify([`${t} B`, '—', `${t} D`, `${t} C`]), `A is hidden from the member, got ${JSON.stringify(seen)}`);
  assert(seen[1].rank === 2 && seen[1].points === 26, 'the row itself stays (rank and points)');
  // cannot — blocks are symmetric for organizers too: the share card (ResultCard) reads '—'
  const card = await rpc(w.org.jwt, 'event_result_summary', { p_event_id: ev });
  assert(JSON.stringify(names(card)) === JSON.stringify([`${t} B`, `${t} A`, '—', `${t} C`]), `D is hidden on the organizer's card, got ${JSON.stringify(card)}`);
  assert(card[2].rank === 3 && card[2].points === 22, "D's row stays on the card");
  // can — a viewer nobody blocked
  const other = await rpc(w.players[1].jwt, 'event_result_summary', { p_event_id: ev });
  assert(JSON.stringify(names(other)) === JSON.stringify([`${t} B`, `${t} A`, `${t} D`, `${t} C`]), 'B sees everyone by name');
});

await run('0139: a soft-deleted event — its organizer keeps the standings, members lose the result', async () => {
  const t = `rv${tag()}`;
  const w = await world(t);
  const ev = await playedEvent(w, { groupId: w.generalId, isPrivate: false });
  await rpc(w.org.jwt, 'post_event_result', { p_event_id: ev });
  assert((await rpc(w.member.jwt, 'event_result_summary', { p_event_id: ev })).length === 4, 'live and posted: members read it');
  await patch('events', `id=eq.${ev}`, { deleted_at: new Date().toISOString() });
  // cannot
  assert((await rpc(w.member.jwt, 'event_result_summary', { p_event_id: ev })).length === 0, 'deleted: members read nothing');
  assert((await rpc(w.member.jwt, 'standings', { p_event_id: ev })).length === 0, 'deleted: no score rows for members');
  // can — set_event_ranking does not check deleted_at (and the organizer always sees their own
  // scoreboard)
  assert((await rpc(w.org.jwt, 'standings', { p_event_id: ev })).length === 4, 'deleted: the organizer still has the table');
});

await run('0139: a session-less trusted caller keeps the scoreboard; badge facts give it nothing; the subject still gets theirs', async () => {
  const t = `rv${tag()}`;
  const w = await world(t);
  const ev = await playedEvent(w, { groupId: w.squadId, isPrivate: true });
  // can — rpc(null, …) is the service role with no user: the path seeds and edge functions take,
  // standing in for cron and the finish_event trigger path.
  const st = await rpc(null, 'standings', { p_event_id: ev });
  assert(st.length === 4 && st.every((r) => r.name_a === null && r.user_a_id === null), 'service role: every score row, no identities (as before 0139)');
  // cannot — player_badge_facts with no viewer answers as if blocked: every counter 0, no placement
  const none = (await rpc(null, 'player_badge_facts', { p_user: w.players[0].id }))[0];
  assert(Object.entries(none).every(([k, v]) => (k === 'best_placement' ? v === null : v === 0)), `no session: zeros, got ${JSON.stringify(none)}`);
  // can — the subject, signed in
  const own = (await rpc(w.players[0].jwt, 'player_badge_facts', { p_user: w.players[0].id }))[0];
  assert(own.matches_scored === 2 && own.signup_rank >= 1, `the subject's own facts, got ${JSON.stringify(own)}`);
});

await run('0139: anon still cannot execute the three reads, and no API role can call the helper', async () => {
  const someone = await user(`rv${tag()}-h`);
  // cannot
  await expectError(() => anonRpc('standings', { p_event_id: null }), DENIED);
  await expectError(() => anonRpc('event_result_summary', { p_event_id: null }), DENIED);
  await expectError(() => anonRpc('player_badge_facts', { p_user: null }), DENIED);
  await expectError(() => anonRpc('_event_result_posted_to', { p_event_id: ZERO, p_user: ZERO }), DENIED);
  await expectError(() => rpc(someone.jwt, '_event_result_posted_to', { p_event_id: ZERO, p_user: ZERO }), DENIED);
  // can — a signed-in caller reaches all three (an empty answer for an unknown event, not an error)
  assert(Array.isArray(await rpc(someone.jwt, 'standings', { p_event_id: ZERO })), 'standings callable when signed in');
  assert(Array.isArray(await rpc(someone.jwt, 'event_result_summary', { p_event_id: ZERO })), 'event_result_summary callable when signed in');
  assert((await rpc(someone.jwt, 'player_badge_facts', { p_user: someone.id }))[0].signup_rank >= 1, 'player_badge_facts callable when signed in');
});
