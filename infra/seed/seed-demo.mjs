#!/usr/bin/env node
/**
 * PadelJam — local demo seed.
 *
 * Populates the LOCAL Supabase with a rich, consistent data graph by driving the
 * real RPCs (per-user JWT) + service-role inserts. Run AFTER `supabase db reset`.
 *
 *   pnpm seed:demo
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the repo-root .env. Refuses
 * to run against a non-local URL (safety). No external deps — uses global fetch.
 *
 * Primary login: demo@padeljam.test  (email OTP — code via Mailpit http://127.0.0.1:55324).
 * All demo accounts also have password `Demo1234#` (UX-GLOB-07: GoTrue's
 * `password_requirements` now rejects a plain `demo1234` on the admin create-user call).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// --- env -------------------------------------------------------------------
function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env — rely on process.env */ }
  return env;
}
const ENV = loadEnv();
const URL = ENV.SUPABASE_URL || 'http://127.0.0.1:55321';
const SERVICE = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY (local). Aborting.'); process.exit(1); }
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(URL)) {
  console.error(`Refusing to seed a non-local URL: ${URL}. This script is local-only.`); process.exit(1);
}

// --- http helpers ----------------------------------------------------------
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
async function req(path, { method = 'GET', jwt, body, prefer } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: SERVICE, Authorization: `Bearer ${jwt || SERVICE}` };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return data;
}
const rpc = (jwt, name, args = {}) => req(`/rest/v1/rpc/${name}`, { method: 'POST', jwt, body: args });
const insert = (table, rows, jwt) =>
  req(`/rest/v1/${table}`, { method: 'POST', jwt, body: rows, prefer: 'return=representation' });
const sel = (table, qs) => req(`/rest/v1/${table}?${qs}`);

async function adminCreateUser(email, phone, password) {
  const u = await req('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, phone, email_confirm: true, phone_confirm: true },
  });
  // Two calls on purpose — same reasoning as seed-e2e.mjs. A one-step
  // create-with-password is an INSERT, and 0101's trg_record_password_set is
  // deliberately AFTER UPDATE, because the INSERT that creates an OTP user writes a
  // bcrypt placeholder into encrypted_password and firing on it would recreate the bug
  // 0101 removed. A persona born with a password is therefore never recorded and reports
  // has_password: false — which in the demo app offers "Create password" to someone who
  // has one. No real user is made that way: every password lands on an account that
  // already exists.
  if (password != null) {
    await req(`/auth/v1/admin/users/${u.id}`, { method: 'PUT', body: { password } });
  }
  return u.id;
}
async function signIn(email, password) {
  const r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  return r.access_token;
}

// --- migration-seeded reference data ------------------------------------------
// plans / plan_features / plan_limits (0013) and blast_templates (0072) come
// from MIGRATIONS, never from this script. The demo seed's own fixtures already
// fit inside the caps — commA sits exactly at Basic's groups_per_community of 3
// (its general group + Tuesday Night League + Weekend Warriors) — but that is
// only meaningful while plan_limits is populated: empty, community_limit()
// returns null for every key and every cap reads as unlimited. The E2E harness
// wipes public tables between runs, so a demo seed run after one can land on a
// database whose reference data is gone. Fail here rather than quietly building
// a demo graph no cap was ever checked against.
const EXPECTED_LIMITS = {
  'starter/groups_per_community': 1,
  'basic/groups_per_community': 3,
  'starter/members_per_community': 10,
  'basic/members_per_community': 50,
  'starter/co_organizers': 0,
  'basic/co_organizers': 1,
};

async function assertReferenceData() {
  const limits = await sel('plan_limits', 'select=plan_id,limit_key,value');
  if (!limits.length) {
    throw new Error('plan_limits is EMPTY — no plan cap can be enforced. Run `supabase db reset` first.');
  }
  const have = Object.fromEntries(limits.map((r) => [`${r.plan_id}/${r.limit_key}`, r.value]));
  for (const [key, expected] of Object.entries(EXPECTED_LIMITS)) {
    if (have[key] !== expected) {
      throw new Error(
        `plan_limits["${key}"] reads back ${JSON.stringify(have[key])}, expected ${expected}. `
        + 'Either 0013_seed_plans.sql changed (update EXPECTED_LIMITS here) or the table was wiped '
        + '(the E2E harness truncates public tables) — run `supabase db reset`.',
      );
    }
  }
  const templates = await sel('blast_templates', 'select=id');
  if (!templates.length) {
    throw new Error('blast_templates is EMPTY — run `supabase db reset` to restore it.');
  }
  console.log(`  reference data OK (${limits.length} plan limits, ${templates.length} blast templates)`);
}

// Captured ONCE at module load, so every isoIn() in a run shares one base and the
// events keep their intended positions relative to each other — which is what the
// original "fixed base (no Date.now drift)" was protecting against.
//
// It used to be a hardcoded Date.UTC(2026, 6, 1), and that is a different thing: it
// does not drift, it EXPIRES. Once real time passed 2026-07-01 every "scheduled"
// event was created in the past, and the seed died at its first join_event with
// `event_closed`. Nothing caught it because `seed:demo` runs in no workflow.
const DEMO_BASE = (() => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
})();

const isoIn = (days, hour = 19) => {
  const d = new Date(DEMO_BASE);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

// Offset from the actual instant, not from DEMO_BASE's midnight. Used for the two
// times that must sit a known distance from `now()` whatever the hour of the run:
// the join window (see joinableAt below) and E3's "started an hour ago".
const hoursFromNow = (h) => new Date(Date.now() + h * 3600_000).toISOString();

// Every event is CREATED at this time, even the ones that belong in the past.
// join_event (0047, redefined in 0093) refuses with `event_closed` once
// `now() > starts_at - interval '6 hours'`, so a roster can only be assembled while
// the event is still more than six hours out. Events that are meant to be live or
// finished are moved to their real time afterwards, with patchEvent below.
//
// Eight hours rather than something larger to match seed-e2e.mjs, which has run
// this same shape for months: far enough outside the cutoff that a slow seed run
// cannot drift into it, close enough that the temporary date is obviously a
// scaffold rather than a plausible event time.
const joinableAt = () => hoursFromNow(8);

// --- cast ------------------------------------------------------------------
const PW = 'Demo1234#';
const CAST = [
  { key: 'alex',  email: 'demo@padeljam.test',  phone: '+351910000001', name: 'Alex Organizer', gender: 'male',   hand: 'right', side: 'left',  time: 'night' },
  { key: 'maria', email: 'maria@padeljam.test', phone: '+351910000002', name: 'Maria Santos',   gender: 'female', hand: 'right', side: 'right', time: 'evening' },
  { key: 'joao',  email: 'joao@padeljam.test',  phone: '+351910000003', name: 'João Pereira',   gender: 'male',   hand: 'left',  side: 'left',  time: 'morning' },
  { key: 'sofia', email: 'sofia@padeljam.test', phone: '+351910000004', name: 'Sofia Costa',    gender: 'female', hand: 'right', side: 'right', time: 'afternoon' },
  { key: 'bruno', email: 'bruno@padeljam.test', phone: '+351910000005', name: 'Bruno Almeida',  gender: 'male',   hand: 'right', side: 'left',  time: 'any' },
  { key: 'rita',  email: 'rita@padeljam.test',  phone: '+351910000006', name: 'Rita Fernandes', gender: 'female', hand: 'left',  side: 'right', time: 'evening' },
  { key: 'pedro', email: 'pedro@padeljam.test', phone: '+351910000007', name: 'Pedro Lopes',    gender: 'male',   hand: 'right', side: 'left',  time: 'morning' },
];
const TIME_ENUM = { evening: 'night', morning: 'morning', afternoon: 'afternoon', night: 'night', any: 'any' };

const U = {}; // key -> { id, jwt }

// --- event helpers ---------------------------------------------------------
// Re-date an event after its roster is built. There is no RPC for this on purpose:
// moving an event in time is not something an organizer does, so the only writer is
// the service role — which is what this script runs as.
//
// It exists because two demo events are meant to be in the PAST, and the RPCs that
// put them there cannot be called in that order. join_event closes six hours before
// `starts_at`, so the roster has to be assembled while the event is still in the
// future; nothing else in the lifecycle looks at `starts_at` at all — start_event,
// submit_score, generate_next_round, finish_event and post_event_result gate on
// `status` and on the caller being the organizer, never on the clock. So: create in
// the join window, drive the real RPCs, then move the event to where it belongs.
//
// Same helper, same reasoning, as seed-e2e.mjs.
const patchEvent = (id, fields) =>
  req(`/rest/v1/events?id=eq.${id}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });

async function scoreRound(jwt, eventId, { all = true, leavePending = 0 } = {}) {
  const rounds = await sel('event_rounds', `event_id=eq.${eventId}&select=id,round_number&order=round_number.desc&limit=1`);
  if (!rounds.length) return;
  const roundId = rounds[0].id;
  const matches = await sel('event_matches', `round_id=eq.${roundId}&select=id,status&order=match_number.asc`);
  const toScore = all ? matches.slice(0, matches.length - leavePending) : matches;
  for (const m of toScore) {
    if (m.status !== 'pending') continue;
    const a = 24, b = 16 + Math.floor(roundId.charCodeAt(0) % 8); // deterministic-ish
    await rpc(jwt, 'submit_score', { p_match_id: m.id, p_side_a: a, p_side_b: b, p_not_played: false });
  }
}

// --- end-state assertions ---------------------------------------------------
// Exiting 0 is not the same as having seeded the demo. Every RPC above already
// throws on an HTTP error, so a run that reaches the end has not hit a 400 — but
// that says nothing about whether the events arrived in the STATES this file's
// comments promise. The two are genuinely different: E3 and E4 are built at a
// throwaway time and moved afterwards, and if a future change dropped a patchEvent
// the seed would still complete, just with a "live" event scheduled for tomorrow.
//
// These checks are the seed's own contract with the demo app, so they live here
// rather than in the CI job that runs it — a developer seeding by hand gets the
// same verdict as the workflow, and there is one copy to keep in step.
async function assertDemoGraph({ e3, e4, g1 }) {
  const fail = (m) => { throw new Error(`demo graph is wrong: ${m}`); };
  const now = Date.now();

  const byId = Object.fromEntries(
    (await sel('events', 'select=id,name,status,starts_at,finished_early,counts_for_ranking'))
      .map((e) => [e.id, e]),
  );

  // E3 is LIVE: in_progress (which only start_event sets) and already under way.
  const live = byId[e3] || fail('E3 is missing');
  if (live.status !== 'in_progress') fail(`E3 "${live.name}" is ${live.status}, expected in_progress`);
  if (Date.parse(live.starts_at) >= now) {
    fail(`E3 "${live.name}" starts at ${live.starts_at}, in the future — it is meant to be under way. `
       + 'The patchEvent that moves it back is missing or ran before start_event.');
  }

  // E4 is COMPLETED, last week, counted for the ranking, and played to the end.
  const done = byId[e4] || fail('E4 is missing');
  if (done.status !== 'completed') fail(`E4 "${done.name}" is ${done.status}, expected completed`);
  if (Date.parse(done.starts_at) >= now - 6 * 86400_000) {
    fail(`E4 "${done.name}" starts at ${done.starts_at}, which is not last week. `
       + 'The back-dating patchEvent after post_event_result is missing.');
  }
  if (done.finished_early) fail('E4 finished early — a round was left unscored, so the standings are partial');
  if (!done.counts_for_ranking) fail('E4 does not count for the ranking, so it contributes nothing to the group table');

  // Both were actually JOINED. This is the check that the six-hour cutoff defeated:
  // an event created inside the window takes its organizer and no one else.
  for (const [eid, label, want] of [[e3, 'E3', 4], [e4, 'E4', 4]]) {
    const roster = await sel('event_participants', `event_id=eq.${eid}&status=eq.confirmed&select=id`);
    if (roster.length !== want) {
      fail(`${label} has ${roster.length} confirmed participants, expected ${want} — `
         + 'the joins did not land (join_event closes 6h before starts_at).');
    }
  }

  // The completed event produced a result post and a group ranking.
  const post = await sel('community_posts', `result_event_id=eq.${e4}&kind=eq.result&select=id`);
  if (post.length !== 1) fail(`E4 has ${post.length} result posts, expected 1`);

  const results = await sel('group_event_results', `event_id=eq.${e4}&select=user_id,final_placement,ranking_points`);
  if (results.length !== 4) fail(`E4 wrote ${results.length} group ranking rows, expected 4`);
  // Placements are deliberately NOT asserted to be distinct. Four players over two
  // mexicano rounds routinely tie on points — win one, lose one, and two players end
  // level — and standings() gives tied players the same rank, correctly. What has to
  // hold is that somebody came first and everyone scored.
  if (!results.some((r) => r.final_placement === 1)) fail('E4 ranking has no first place');
  if (!results.every((r) => r.ranking_points !== null)) fail('an E4 ranking row has null points');
  if (!results.some((r) => r.ranking_points > 0)) fail('E4 ranking rows carry no points');

  // ...and it lands in the group's open season, which is what the demo's table reads.
  const season = await sel('group_seasons', `group_id=eq.${g1}&ended_at=is.null&select=id`);
  if (season.length !== 1) fail(`group ${g1} has ${season.length} open seasons, expected 1`);

  console.log(`  graph OK (E3 live since ${live.starts_at}, E4 completed ${done.starts_at}, `
    + `${results.length} ranking rows in the open season)`);
}

async function main() {
  console.log(`Seeding demo data → ${URL}`);

  // Guard: already seeded?
  const existing = await sel('profiles', `email=eq.demo@padeljam.test&select=id`);
  if (existing.length) {
    console.error('Demo data already present (demo@padeljam.test exists). Run `supabase db reset` first, then re-run.');
    process.exit(1);
  }
  await assertReferenceData();

  // 1) Users + profiles -----------------------------------------------------
  for (const c of CAST) {
    const id = await adminCreateUser(c.email, c.phone, PW);
    await insert('profiles', {
      id, email: c.email, phone: c.phone, full_name: c.name, locale: 'pt-PT',
      onboarded_at: new Date().toISOString(),
      gender: c.gender, dominant_hand: c.hand, court_side: c.side,
      preferred_time: TIME_ENUM[c.time], description: `${c.name} — demo player.`,
    });
    const jwt = await signIn(c.email, PW);
    U[c.key] = { id, jwt };
    console.log(`  user ${c.email}`);
  }
  const id = (k) => U[k].id;
  const jwt = (k) => U[k].jwt;

  // 2) Social graph (service inserts; triggers fire follow notifications) ----
  await insert('follows', [
    { follower_id: id('alex'), followee_id: id('maria') },
    { follower_id: id('alex'), followee_id: id('joao') },
    { follower_id: id('alex'), followee_id: id('sofia') },
    { follower_id: id('maria'), followee_id: id('alex') },
    { follower_id: id('joao'), followee_id: id('alex') },
    { follower_id: id('sofia'), followee_id: id('alex') },
    { follower_id: id('bruno'), followee_id: id('alex') },
  ]);
  console.log('  follows seeded');

  // 3) Communities ----------------------------------------------------------
  // NOTE: the one-community cap was lifted in migration 0098 (UX-COMM-09), so this split is no
  // longer forced. It is kept because the demo needs a community Alex ADMINISTERS BUT DID NOT
  // CREATE: C carries the request_to_join "Requests" demo, and Alex is promoted there so he sees
  // its pending requests as a non-creator admin.
  // A: public, created by Alex — the main showcase.
  const commA = await rpc(jwt('alex'), 'create_community_with_personal_tenant', {
    p_name: 'Lisbon Padel Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: 'The friendliest padel club in Lisbon.', p_location: 'Lisbon, PT',
    p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: true, p_cancellation_rules_text: 'Cancel at least 12h before.',
  });
  // Subscribe A to Basic (default 'starter' caps groups=1/members=10; Basic lifts to 3/50).
  await insert('community_subscriptions', { community_id: commA, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });
  // C: request_to_join, created by Maria — Alex is promoted to admin (Requests demo + member-view).
  const commC = await rpc(jwt('maria'), 'create_community_with_personal_tenant', {
    p_name: 'Cascais Social', p_type: 'friends', p_country: 'PT', p_privacy: 'request_to_join',
    p_description: 'Weekend social games.', p_location: 'Cascais, PT',
    p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  // Subscribe C to Basic too. Starter's co_organizers limit is 0, which since 0098 means "one
  // admin, no co-organizers" — the creator already fills that slot, so promoting Alex needs Basic.
  await insert('community_subscriptions', { community_id: commC, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });
  console.log(`  communities: A=${commA} C=${commC}`);

  // A (public → immediate join): all five players become members.
  for (const k of ['maria', 'joao', 'sofia', 'bruno', 'rita']) await rpc(jwt(k), 'join_community', { p_community_id: commA, p_ack: true });
  // Promote Maria to admin of A so she can organize group events (A is on Basic: 1 co-organizer).
  await req(`/rest/v1/community_members?community_id=eq.${commA}&user_id=eq.${id('maria')}`, {
    method: 'PATCH', body: { role: 'admin' }, prefer: 'return=minimal',
  });
  // C: Maria invites Alex → Alex accepts → promote Alex to admin.
  await rpc(jwt('maria'), 'invite_to_community', { p_community_id: commC, p_invitee_ids: [id('alex')], p_group_ids: [] });
  const inv = await sel('community_invitations', `community_id=eq.${commC}&invitee_id=eq.${id('alex')}&select=id`);
  await rpc(jwt('alex'), 'accept_invitation', { p_invitation_id: inv[0].id });
  await req(`/rest/v1/community_members?community_id=eq.${commC}&user_id=eq.${id('alex')}`, {
    method: 'PATCH', body: { role: 'admin' }, prefer: 'return=minimal',
  });
  // C pending join requests (Rita + Pedro) → the Requests manage screen has content.
  for (const k of ['rita', 'pedro']) await rpc(jwt(k), 'join_community', { p_community_id: commC, p_ack: true });
  console.log('  memberships + maria→admin(A) + alex→admin(C) + 2 pending requests(C)');

  // 4) Posts / comments / likes / reviews (A) -------------------------------
  const posts = await insert('community_posts', [
    { community_id: commA, author_id: id('alex'), kind: 'user', body: 'Welcome to Lisbon Padel Club! 🎾 Sign up for Tuesday night league.' },
    { community_id: commA, author_id: id('maria'), kind: 'user', body: 'Great games last weekend, thanks everyone!' },
  ]); // service-role: rows have mixed authors, so bypass the author=uid RLS check
  await insert('post_comments', [
    { post_id: posts[0].id, author_id: id('joao'), body: 'Count me in!' },
    { post_id: posts[0].id, author_id: id('sofia'), body: 'See you there 💪' },
  ]);
  await insert('post_likes', [
    { post_id: posts[0].id, user_id: id('maria') },
    { post_id: posts[0].id, user_id: id('joao') },
    { post_id: posts[1].id, user_id: id('alex') },
  ]);
  // Reviews via service-role insert: can_review_community requires ≥3 completed events,
  // more than the demo seeds, so bypass the gate (reviewers are real members of A).
  await insert('community_reviews', [
    { community_id: commA, user_id: id('maria'), rating: 5, body: 'Amazing club, great people.' },
    { community_id: commA, user_id: id('joao'), rating: 4, body: 'Well organized events.' },
  ]);
  console.log('  posts/comments/likes/reviews');

  // 5) Groups (in A) --------------------------------------------------------
  const g1 = await rpc(jwt('alex'), 'create_group', { p_community_id: commA, p_name: 'Tuesday Night League', p_description: 'Weekly competitive americano.', p_is_private: false, p_thumbnail_path: null });
  const g2 = await rpc(jwt('alex'), 'create_group', { p_community_id: commA, p_name: 'Weekend Warriors', p_description: 'Casual weekend games.', p_is_private: false, p_thumbnail_path: null });
  for (const k of ['maria', 'joao', 'sofia', 'bruno', 'rita']) await rpc(jwt(k), 'join_group', { p_group_id: g1 });
  for (const k of ['maria', 'joao']) await rpc(jwt(k), 'join_group', { p_group_id: g2 });
  await rpc(jwt('alex'), 'invite_to_group', { p_group_id: g2, p_invitee_id: id('rita') }); // pending
  console.log(`  groups: g1=${g1} g2=${g2}`);

  // 6) Venue + courts (for the create-wizard venue search) ------------------
  const venue = await insert('venues', { name: 'Lisbon Padel Arena', address: 'Av. da Liberdade, Lisbon', community_id: commA, created_by: id('alex') });
  await insert('courts', [
    { venue_id: venue[0].id, name: 'Court 1', sort_order: 1 },
    { venue_id: venue[0].id, name: 'Court 2', sort_order: 2 },
  ]);

  const baseEvent = (over) => ({
    group_id: g1, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
    organizer_role: 'organizing_and_playing', name: 'Event', venue_id: null,
    manual_location_name: 'Lisbon Padel Arena', manual_location_address: 'Av. da Liberdade', has_location: true,
    location_lat: null, location_lng: null, location_text: null,
    num_courts: 1, starts_at: isoIn(3), duration_minutes: 90, allow_standby: true, standby_spots: 2,
    is_private: false, players_submit_results: false,
    entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
    description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
  });

  // 7) Events ---------------------------------------------------------------
  // E1 — scheduled americano, organizer Maria (admin), Alex GOING, 1 waitlist, rita invited
  const e1 = await rpc(jwt('maria'), 'create_event', { p_payload: baseEvent({
    name: 'Tuesday Americano', organizer_role: 'organizing_and_playing', starts_at: isoIn(3),
    entrance_fee_enabled: true, entrance_fee_amount: 5, entrance_fee_method: 'cash',
    invitees: [{ invitee_id: id('pedro'), name: null, email: null, phone: null }],
  }) });
  for (const k of ['alex', 'joao', 'sofia']) await rpc(jwt(k), 'join_event', { p_event_id: e1 }); // confirmed (4 incl maria)
  await rpc(jwt('bruno'), 'join_event', { p_event_id: e1 }); // waiting_list (cap 4)
  console.log(`  E1 scheduled americano = ${e1}`);

  // E2 — scheduled team event, organizer Maria; teams formed; pending partner request to Alex
  const e2 = await rpc(jwt('maria'), 'create_event', { p_payload: baseEvent({
    name: 'Team Cup', specification: 'team', organizer_role: 'organizing_only', starts_at: isoIn(5), num_courts: 1,
  }) });
  await rpc(jwt('sofia'), 'choose_partner', { p_event_id: e2, p_partner_user: id('bruno') }); // team
  await rpc(jwt('rita'), 'request_partner', { p_event_id: e2, p_targets: [id('alex')] }); // pending → Alex inbox
  console.log(`  E2 scheduled team = ${e2}`);

  // E3 — in-progress (mexicano: server seeds rounds), organizer Alex, partial scores + timer.
  // Created in the join window and moved back once the roster exists — it used to be created
  // at isoIn(0, 9), today 09:00, which no one can join. 'in_progress' comes from start_event,
  // never from starts_at: nothing promotes an event when its start time passes (see 0090's
  // comment on my_events), so the state and the time have to be set separately.
  //
  // One hour back, relative to the run, not a fixed hour of the day: the slot is 90 minutes,
  // so this event is genuinely mid-session — round 1 played, round 2 on court — whenever the
  // seed is run. (seed-e2e.mjs uses two hours for the same event. It can: its job is to give
  // a suite something in_progress to assert on, and whether the booked slot has elapsed does
  // not change that. Here the whole point is that the screen looks right.)
  const e3 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Live Mexicano', event_type: 'mexicano', starts_at: joinableAt(),
  }) });
  for (const k of ['joao', 'sofia', 'bruno']) await rpc(jwt(k), 'join_event', { p_event_id: e3 }); // +alex = 4 confirmed
  await rpc(jwt('alex'), 'start_event', { p_event_id: e3 });
  await patchEvent(e3, { starts_at: hoursFromNow(-1) });
  await scoreRound(jwt('alex'), e3); // score round 1
  await rpc(jwt('alex'), 'generate_next_round', { p_event_id: e3 }); // round 2 pending
  await rpc(jwt('alex'), 'set_event_timer', { p_event_id: e3, p_action: 'start' });
  await rpc(jwt('alex'), 'send_event_blast', { p_event_id: e3, p_source_template_id: null, p_title: 'See you on court!', p_description: 'Round 2 starting soon — grab water.', p_image_path: null, p_channels: ['email'] });
  console.log(`  E3 in-progress mexicano = ${e3}`);

  // E4 — completed (mexicano), organizer Alex, scored + finished → group ranking + result post.
  // Same treatment as E3, and for the same reason: it was created at isoIn(-7, 9), a week in
  // the past, so its three joins could never have succeeded. Built in the join window, played
  // through to completion, then back-dated at the END — after finish_event, whose ranking
  // insert reads standings() and the open season, never the clock, so the group ranking it
  // writes is unaffected by the move.
  const e4 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Last Week Mexicano', event_type: 'mexicano', starts_at: joinableAt(),
  }) });
  for (const k of ['maria', 'joao', 'sofia']) await rpc(jwt(k), 'join_event', { p_event_id: e4 });
  await rpc(jwt('alex'), 'start_event', { p_event_id: e4 });
  await scoreRound(jwt('alex'), e4);
  await rpc(jwt('alex'), 'generate_next_round', { p_event_id: e4 });
  await scoreRound(jwt('alex'), e4);
  await rpc(jwt('alex'), 'finish_event', { p_event_id: e4, p_counts_override: true, p_finish_message: 'GG everyone — see you next week!' });
  await rpc(jwt('alex'), 'post_event_result', { p_event_id: e4 });
  await patchEvent(e4, { starts_at: isoIn(-7, 9) });
  console.log(`  E4 completed mexicano = ${e4}`);

  // E5 — recurring scheduled (series), organizer Alex
  const e5 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Weekly Friday Social', starts_at: isoIn(7, 18),
    series: { day_of_week: 5, start_time: '18:00', duration_minutes: 90, invite_lead_days: 5 },
  }) });
  for (const k of ['maria', 'joao']) await rpc(jwt(k), 'join_event', { p_event_id: e5 });
  console.log(`  E5 recurring = ${e5}`);

  // 8) Assert the graph is what the comments above claim ---------------------
  await assertDemoGraph({ e3, e4, g1 });

  // 9) Summary --------------------------------------------------------------
  const count = async (t) => {
    const r = await fetch(`${URL}/rest/v1/${t}?select=id`, { headers: { ...svc, Prefer: 'count=exact', Range: '0-0' } });
    return (r.headers.get('content-range') || '/?').split('/')[1];
  };
  console.log('\nDone. Counts:');
  for (const t of ['profiles', 'communities', 'community_members', 'community_posts', 'community_reviews', 'groups', 'group_seasons', 'events', 'event_participants', 'event_matches', 'group_event_results', 'follows', 'partner_requests', 'event_invitations', 'notifications']) {
    console.log(`  ${t}: ${await count(t)}`);
  }
  console.log('\nLogin: demo@padeljam.test  (email OTP via Mailpit http://127.0.0.1:55324; password Demo1234#)');
}

main().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
