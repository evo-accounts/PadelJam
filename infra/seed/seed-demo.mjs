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
 * All demo accounts also have password `demo1234`.
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
    body: { email, phone, password, email_confirm: true, phone_confirm: true },
  });
  return u.id;
}
async function signIn(email, password) {
  const r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  return r.access_token;
}

const isoIn = (days, hour = 19) => {
  const d = new Date(Date.UTC(2026, 6, 1, hour, 0, 0)); // fixed base (no Date.now drift)
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

// --- cast ------------------------------------------------------------------
const PW = 'demo1234';
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

// --- match helper ----------------------------------------------------------
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

async function main() {
  console.log(`Seeding demo data → ${URL}`);

  // Guard: already seeded?
  const existing = await sel('profiles', `email=eq.demo@padeljam.test&select=id`);
  if (existing.length) {
    console.error('Demo data already present (demo@padeljam.test exists). Run `supabase db reset` first, then re-run.');
    process.exit(1);
  }

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
  // NOTE: each user may OWN at most 1 community (can_create_community cap). So Alex
  // owns A only; the request_to_join "Requests" demo lives in Maria's community C,
  // where Alex is made an admin so he sees its pending requests.
  // A: public, owner Alex — the main showcase.
  const commA = await rpc(jwt('alex'), 'create_community_with_personal_tenant', {
    p_name: 'Lisbon Padel Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: 'The friendliest padel club in Lisbon.', p_location: 'Lisbon, PT',
    p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: true, p_cancellation_rules_text: 'Cancel at least 12h before.',
  });
  // Subscribe A to Basic (default 'starter' caps groups=1/members=10; Basic lifts to 3/50).
  await insert('community_subscriptions', { community_id: commA, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });
  // C: request_to_join, owner Maria — Alex is admin (Requests demo + member-view).
  const commC = await rpc(jwt('maria'), 'create_community_with_personal_tenant', {
    p_name: 'Cascais Social', p_type: 'friends', p_country: 'PT', p_privacy: 'request_to_join',
    p_description: 'Weekend social games.', p_location: 'Cascais, PT',
    p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  // Subscribe C to Basic too (starter caps co_organizers=0, blocking the admin promotion below).
  await insert('community_subscriptions', { community_id: commC, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });
  console.log(`  communities: A=${commA} C=${commC}`);

  // A (public → immediate join): all five players become members.
  for (const k of ['maria', 'joao', 'sofia', 'bruno', 'rita']) await rpc(jwt(k), 'join_community', { p_community_id: commA, p_ack: true });
  // Promote Maria to admin of A so she can organize group events.
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

  // E3 — in-progress (mexicano: server seeds rounds), organizer Alex, partial scores + timer
  const e3 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Live Mexicano', event_type: 'mexicano', starts_at: isoIn(0, 9),
  }) });
  for (const k of ['joao', 'sofia', 'bruno']) await rpc(jwt(k), 'join_event', { p_event_id: e3 }); // +alex = 4 confirmed
  await rpc(jwt('alex'), 'start_event', { p_event_id: e3 });
  await scoreRound(jwt('alex'), e3); // score round 1
  await rpc(jwt('alex'), 'generate_next_round', { p_event_id: e3 }); // round 2 pending
  await rpc(jwt('alex'), 'set_event_timer', { p_event_id: e3, p_action: 'start' });
  await rpc(jwt('alex'), 'send_event_blast', { p_event_id: e3, p_source_template_id: null, p_title: 'See you on court!', p_description: 'Round 2 starting soon — grab water.', p_image_path: null, p_channels: ['email'] });
  console.log(`  E3 in-progress mexicano = ${e3}`);

  // E4 — completed (mexicano), organizer Alex, scored + finished → group ranking + result post
  const e4 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Last Week Mexicano', event_type: 'mexicano', starts_at: isoIn(-7, 9),
  }) });
  for (const k of ['maria', 'joao', 'sofia']) await rpc(jwt(k), 'join_event', { p_event_id: e4 });
  await rpc(jwt('alex'), 'start_event', { p_event_id: e4 });
  await scoreRound(jwt('alex'), e4);
  await rpc(jwt('alex'), 'generate_next_round', { p_event_id: e4 });
  await scoreRound(jwt('alex'), e4);
  await rpc(jwt('alex'), 'finish_event', { p_event_id: e4, p_counts_override: true, p_finish_message: 'GG everyone — see you next week!' });
  await rpc(jwt('alex'), 'post_event_result', { p_event_id: e4 });
  console.log(`  E4 completed mexicano = ${e4}`);

  // E5 — recurring scheduled (series), organizer Alex
  const e5 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Weekly Friday Social', starts_at: isoIn(7, 18),
    series: { day_of_week: 5, start_time: '18:00', duration_minutes: 90, invite_lead_days: 5 },
  }) });
  for (const k of ['maria', 'joao']) await rpc(jwt(k), 'join_event', { p_event_id: e5 });
  console.log(`  E5 recurring = ${e5}`);

  // 8) Summary --------------------------------------------------------------
  const count = async (t) => {
    const r = await fetch(`${URL}/rest/v1/${t}?select=id`, { headers: { ...svc, Prefer: 'count=exact', Range: '0-0' } });
    return (r.headers.get('content-range') || '/?').split('/')[1];
  };
  console.log('\nDone. Counts:');
  for (const t of ['profiles', 'communities', 'community_members', 'community_posts', 'community_reviews', 'groups', 'group_seasons', 'events', 'event_participants', 'event_matches', 'group_event_results', 'follows', 'partner_requests', 'event_invitations', 'notifications']) {
    console.log(`  ${t}: ${await count(t)}`);
  }
  console.log('\nLogin: demo@padeljam.test  (email OTP via Mailpit http://127.0.0.1:55324; password demo1234)');
}

main().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
