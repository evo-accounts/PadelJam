#!/usr/bin/env node
/**
 * PadelJam — E2E seed (fork of seed-demo.mjs).
 *
 * Differences from the demo seed:
 *   - Dates are NOW-relative (join/leave cutoffs and "upcoming" filters depend on now()).
 *   - Extra personas + fixtures for error-state tests (cutoff/full/private events,
 *     private community, review-unlocked community, single-admin community, plan caps,
 *     an un-onboarded user, and a disposable delete-account user).
 *   - `--profile minimal` seeds users only (fast path for auth/onboarding suites).
 *
 * Run AFTER a DB reset (scripts/e2e/run.mjs orchestrates this):
 *   node infra/seed/seed-e2e.mjs [--profile minimal|full]
 *
 * Local-only: refuses non-local SUPABASE_URL. All accounts use password `Demo1234#` (UX-GLOB-07:
 * GoTrue's `password_requirements` enforces uppercase/digit/symbol on the admin create-user call
 * too, so a plain `demo1234` is now refused).
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
const PROFILE = process.argv.includes('--profile')
  ? process.argv[process.argv.indexOf('--profile') + 1]
  : 'full';
if (!['minimal', 'full'].includes(PROFILE)) { console.error(`Unknown --profile ${PROFILE}`); process.exit(1); }

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

// --- migration-seeded reference data ------------------------------------------
// plans / plan_features / plan_limits (0013) and blast_templates (0072) are
// inserted by MIGRATIONS, never by this script. A wipe that truncates them
// leaves them empty for the rest of the run with nothing to refill them, and an
// empty plan_limits is silent: community_limit() returns null for every key,
// which the cap triggers (0015/0017/0045) read as "unlimited". That is how the
// whole E2E suite ran for months with no plan limit enforced at all. Assert the
// tables up front so the next regression fails here instead of nowhere.
const EXPECTED_LIMITS = {
  'starter/groups_per_community': 1,
  'basic/groups_per_community': 3,
  'starter/members_per_community': 10,
  'basic/members_per_community': 50,
  'starter/co_organizers': 0,
  'basic/co_organizers': 1,
};
const WIPE_HINT =
  'wipeDb() in apps/mobile/e2e/fixtures/seed.ts truncates every public table except an '
  + 'explicit allow-list; add the table there, or run `supabase db reset` to restore it.';

async function assertReferenceData() {
  const limits = await sel('plan_limits', 'select=plan_id,limit_key,value');
  if (!limits.length) {
    throw new Error(`plan_limits is EMPTY — no plan cap can be enforced. ${WIPE_HINT}`);
  }
  const have = Object.fromEntries(limits.map((r) => [`${r.plan_id}/${r.limit_key}`, r.value]));
  for (const [key, expected] of Object.entries(EXPECTED_LIMITS)) {
    if (have[key] !== expected) {
      throw new Error(
        `plan_limits["${key}"] reads back ${JSON.stringify(have[key])}, expected ${expected}. `
        + `Either 0013_seed_plans.sql changed (update EXPECTED_LIMITS here) or the table was wiped. ${WIPE_HINT}`,
      );
    }
  }
  const templates = await sel('blast_templates', 'select=id');
  if (!templates.length) {
    throw new Error(`blast_templates is EMPTY — the blast template picker has no fixtures. ${WIPE_HINT}`);
  }
  console.log(`  reference data OK (${limits.length} plan limits, ${templates.length} blast templates)`);
}

/**
 * End-to-end proof that the caps actually BITE, not just that the rows exist:
 * `communityId` must already sit at its groups_per_community cap, so one more
 * group has to be refused. Reading plan_limits (above) only shows the data is
 * there; this shows the trigger reaches it.
 */
async function assertGroupCapEnforced(communityId, ownerKey) {
  let created = null;
  try {
    created = await rpc(U[ownerKey].jwt, 'create_group', {
      p_community_id: communityId, p_name: 'Cap Probe', p_description: null,
      p_is_private: false, p_thumbnail_path: null,
    });
  } catch (e) {
    if (/groups_per_community/.test(e.message)) return; // the cap fired — as it must
    throw e;
  }
  // Best-effort cleanup; the throw below is the point, so never let a failed
  // delete replace it with a less useful error.
  try { await req(`/rest/v1/groups?id=eq.${created}`, { method: 'DELETE' }); } catch { /* ignore */ }
  throw new Error(
    'plan caps are NOT enforced: a community already at its groups_per_community cap '
    + `accepted another group (${created}). ${WIPE_HINT}`,
  );
}

// --- dates: NOW-relative ---------------------------------------------------
// Base = current hour (truncated) so repeated runs within an hour are stable-ish
// while cutoffs (6h join / 12h leave) and "upcoming" filters behave correctly.
const NOW = new Date();
const isoIn = (days, hour = 19) => {
  const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate(), hour, 0, 0));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};
const hoursFromNow = (h) => new Date(Date.now() + h * 3600_000).toISOString();

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
  // E2E-only personas. The one-community cap is gone (0098); they stay distinct because each
  // fixture community needs a creator who is NOT a member of the others.
  { key: 'nina',  email: 'nina@padeljam.test',  phone: '+351910000008', name: 'Nina Privada',   gender: 'female', hand: 'right', side: 'left',  time: 'evening' },
  { key: 'tiago', email: 'tiago@padeljam.test', phone: '+351910000009', name: 'Tiago Reviews',  gender: 'male',   hand: 'right', side: 'right', time: 'night' },
  { key: 'carla', email: 'carla@padeljam.test', phone: '+351910000010', name: 'Carla Solo',     gender: 'female', hand: 'left',  side: 'left',  time: 'any' },
  { key: 'dora',  email: 'dora@padeljam.test',  phone: '+351910000011', name: 'Dora Descartável', gender: 'female', hand: 'right', side: 'right', time: 'any', noLocation: true },
  { key: 'omar',  email: 'omar@padeljam.test',  phone: '+351910000012', name: 'Omar Novato',    gender: 'male',   hand: null,    side: null,    time: null, notOnboarded: true },
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

// Back-date an event after the fact (joins are blocked ≤6h before starts_at, so past
// events must be created in the future, populated, then re-dated via service role).
/**
 * Delete every auto-created invitation on an event.
 *
 * Public group events invite every member of the group, so through the RPCs
 * alone a group member can only ever arrive at an event HOLDING an invitation —
 * and an invitee is shown Accept/Decline, never the waiting-list, join-cutoff or
 * partner-selection CTAs the app shows everyone else. Those states are real and
 * reachable in the app (a member who joined the group after the invitations went
 * out, an invitation already declined) but unreachable in a seed built purely
 * from RPCs. Removing the rows afterwards is the same shape as the back-dating
 * patch below: construct through the RPC, then undo what the RPC necessarily did.
 */
const suppressInvitations = (eventId) =>
  req(`/rest/v1/event_invitations?event_id=eq.${eventId}`, { method: 'DELETE' });

const patchEvent = (id, fields) =>
  req(`/rest/v1/events?id=eq.${id}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });

// Create + fully complete a small americano so a community accrues completed events.
async function completedEvent(orgKey, groupId, name, daysAgo, joinKeys) {
  const eid = await rpc(U[orgKey].jwt, 'create_event', { p_payload: baseEvent({
    group_id: groupId, name, event_type: 'mexicano', starts_at: hoursFromNow(8),
  }) });
  for (const k of joinKeys) await rpc(U[k].jwt, 'join_event', { p_event_id: eid });
  await rpc(U[orgKey].jwt, 'start_event', { p_event_id: eid });
  await scoreRound(U[orgKey].jwt, eid);
  await rpc(U[orgKey].jwt, 'finish_event', { p_event_id: eid, p_counts_override: true, p_finish_message: null });
  await patchEvent(eid, { starts_at: isoIn(-daysAgo, 9) });
  return eid;
}

let baseEvent; // bound after g1 exists

async function main() {
  console.log(`Seeding E2E data (${PROFILE}) → ${URL}`);

  const existing = await sel('profiles', `email=eq.demo@padeljam.test&select=id`);
  if (existing.length) {
    console.error('Data already present (demo@padeljam.test exists). Reset the DB first.');
    process.exit(1);
  }
  await assertReferenceData();

  // 1) Users + profiles -----------------------------------------------------
  for (const c of CAST) {
    const uid = await adminCreateUser(c.email, c.phone, PW);
    await insert('profiles', {
      id: uid, email: c.email, phone: c.phone, full_name: c.name, locale: 'en',
      onboarded_at: c.notOnboarded ? null : new Date().toISOString(),
      gender: c.gender, dominant_hand: c.hand, court_side: c.side,
      preferred_time: c.time ? TIME_ENUM[c.time] : null,
      description: `${c.name} — e2e player.`,
      location_text: c.noLocation || c.notOnboarded ? null : 'Lisbon, PT',
    });
    const jwt = await signIn(c.email, PW);
    U[c.key] = { id: uid, jwt };
    console.log(`  user ${c.email}`);
  }
  const id = (k) => U[k].id;
  const jwt = (k) => U[k].jwt;

  if (PROFILE === 'minimal') {
    console.log('\nDone (minimal profile: users only).');
    return;
  }

  // 2) Social graph ---------------------------------------------------------
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
  // A: public showcase (created by alex, Basic plan). C: request_to_join (created by maria, Basic).
  const commA = await rpc(jwt('alex'), 'create_community_with_personal_tenant', {
    p_name: 'Lisbon Padel Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: 'The friendliest padel club in Lisbon.', p_location: 'Lisbon, PT',
    p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: true, p_cancellation_rules_text: 'Cancel at least 12h before.',
  });
  // community_pro, not basic. A is seeded with FOUR groups (its general group plus
  // Tuesday Night League, Weekend Warriors and Secret Squad) and basic caps
  // groups_per_community at 3 — invisible until plan_limits stopped being wiped.
  // Raising the plan keeps every other fixture in A EXACTLY as it was, which
  // matters: moving a group out of A changes what Home renders for alex, and
  // suite 10 reaches its groups through Home. community_pro also RAISES
  // co_organizers (3, against basic's 1), so maria's promotion still fits.
  // Nothing asserts A's plan — suite 11's Basic assertions are on community C.
  await insert('community_subscriptions', { community_id: commA, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const commC = await rpc(jwt('maria'), 'create_community_with_personal_tenant', {
    p_name: 'Cascais Social', p_type: 'friends', p_country: 'PT', p_privacy: 'request_to_join',
    p_description: 'Weekend social games.', p_location: 'Cascais, PT',
    p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: commC, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });

  // C3: private community (created by nina) — no-access assertions.
  const commP = await rpc(jwt('nina'), 'create_community_with_personal_tenant', {
    p_name: 'Private Padel Society', p_type: 'friends', p_country: 'PT', p_privacy: 'private',
    p_description: 'Invite only.', p_location: 'Sintra, PT',
    p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });

  // C4: review-unlocked community (created by tiago, Basic) — 3 completed events below.
  const commR = await rpc(jwt('tiago'), 'create_community_with_personal_tenant', {
    p_name: 'Review Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: 'Three finished events and counting.', p_location: 'Porto, PT',
    p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: commR, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });

  // C5: single-admin community on the default Starter plan (created by carla) —
  // the last-admin guard (0098) and plan-cap fixtures. Starter allows ONE group
  // per community and the general group created below fills it, so this
  // community sits exactly AT the cap (see the groups section).
  const commS = await rpc(jwt('carla'), 'create_community_with_personal_tenant', {
    p_name: 'Carla Solo Club', p_type: 'friends', p_country: 'PT', p_privacy: 'public',
    p_description: 'Starter plan, one admin.', p_location: 'Faro, PT',
    p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  console.log(`  communities: A=${commA} C=${commC} P=${commP} R=${commR} S=${commS}`);

  // Memberships.
  for (const k of ['maria', 'joao', 'sofia', 'bruno', 'rita']) await rpc(jwt(k), 'join_community', { p_community_id: commA, p_ack: true });
  await req(`/rest/v1/community_members?community_id=eq.${commA}&user_id=eq.${id('maria')}`, {
    method: 'PATCH', body: { role: 'admin' }, prefer: 'return=minimal',
  });
  await rpc(jwt('maria'), 'invite_to_community', { p_community_id: commC, p_invitee_ids: [id('alex')], p_group_ids: [] });
  const inv = await sel('community_invitations', `community_id=eq.${commC}&invitee_id=eq.${id('alex')}&select=id`);
  await rpc(jwt('alex'), 'accept_invitation', { p_invitation_id: inv[0].id });
  await req(`/rest/v1/community_members?community_id=eq.${commC}&user_id=eq.${id('alex')}`, {
    method: 'PATCH', body: { role: 'admin' }, prefer: 'return=minimal',
  });
  for (const k of ['rita', 'pedro']) await rpc(jwt(k), 'join_community', { p_community_id: commC, p_ack: true }); // pending requests
  for (const k of ['joao', 'sofia', 'bruno']) await rpc(jwt(k), 'join_community', { p_community_id: commR, p_ack: true });
  await rpc(jwt('joao'), 'join_community', { p_community_id: commS, p_ack: true }); // the member carla must promote before she can leave
  console.log('  memberships + admins + pending requests');

  // 4) Posts / comments / likes / reviews (A) -------------------------------
  const posts = await insert('community_posts', [
    { community_id: commA, author_id: id('alex'), kind: 'user', body: 'Welcome to Lisbon Padel Club! 🎾 Sign up for Tuesday night league.' },
    { community_id: commA, author_id: id('maria'), kind: 'user', body: 'Great games last weekend, thanks everyone!' },
  ]);
  await insert('post_comments', [
    { post_id: posts[0].id, author_id: id('joao'), body: 'Count me in!' },
    { post_id: posts[0].id, author_id: id('sofia'), body: 'See you there 💪' },
  ]);
  await insert('post_likes', [
    { post_id: posts[0].id, user_id: id('maria') },
    { post_id: posts[0].id, user_id: id('joao') },
    { post_id: posts[1].id, user_id: id('alex') },
  ]);
  console.log('  posts/comments/likes');

  // 5) Groups ---------------------------------------------------------------
  // groups_per_community COUNTS the auto-created general group (0015/0017), so
  // Basic's 3 buys a community its general group plus two more — which is
  // exactly the shape seed-demo.mjs has always had for commA. This fork added a
  // third named group and went one over; it only ever succeeded because the
  // harness wiped plan_limits (see assertReferenceData above).
  const g1 = await rpc(jwt('alex'), 'create_group', { p_community_id: commA, p_name: 'Tuesday Night League', p_description: 'Weekly competitive americano.', p_is_private: false, p_thumbnail_path: null });
  const g2 = await rpc(jwt('alex'), 'create_group', { p_community_id: commA, p_name: 'Weekend Warriors', p_description: 'Casual weekend games.', p_is_private: false, p_thumbnail_path: null });
  for (const k of ['maria', 'joao', 'sofia', 'bruno', 'rita']) await rpc(jwt(k), 'join_group', { p_group_id: g1 });
  for (const k of ['maria', 'joao']) await rpc(jwt(k), 'join_group', { p_group_id: g2 });
  await rpc(jwt('alex'), 'invite_to_group', { p_group_id: g2, p_invitee_id: id('rita') }); // pending
  const gR = await rpc(jwt('tiago'), 'create_group', { p_community_id: commR, p_name: 'Review League', p_description: 'Completed events live here.', p_is_private: false, p_thumbnail_path: null });
  for (const k of ['joao', 'sofia', 'bruno']) await rpc(jwt(k), 'join_group', { p_group_id: gR });
  // community with a free slot (general + Review League = 2 of 3). The move
  // costs the tests nothing: the assertion it feeds needs a viewer who is in the
  // COMMUNITY but not in the group, and joao is a member of Review Club too.
  const g3 = await rpc(jwt('alex'), 'create_group', { p_community_id: commA, p_name: 'Secret Squad', p_description: 'Private group.', p_is_private: true, p_thumbnail_path: null });
  await rpc(jwt('alex'), 'invite_to_group', { p_group_id: g3, p_invitee_id: id('maria') }); // invited-private join path
  // commS has NO subscription, so it is on Starter, whose groups_per_community
  // is 1 — and its auto-created general group already occupies that one slot.
  // "Starter cap reached" is therefore the state the community is ALREADY in;
  // the "Only Group" the seed used to create on top of it was one OVER the cap,
  // not at it. gS is that general group: the only group in the community, which
  // is what the fixture always meant.
  const generalS = await sel('groups', `community_id=eq.${commS}&is_general=eq.true&select=id`);
  if (generalS.length !== 1) {
    throw new Error(`commS should have exactly one general group, found ${generalS.length}`);
  }
  const gS = generalS[0].id;
  console.log(`  groups: g1=${g1} g2=${g2} g3(private, in R)=${g3} gR=${gR} gS(general, at Starter cap)=${gS}`);
  await assertGroupCapEnforced(commS, 'carla');

  // 6) Venue + courts -------------------------------------------------------
  const venue = await insert('venues', { name: 'Lisbon Padel Arena', address: 'Av. da Liberdade, Lisbon', community_id: commA, created_by: id('alex') });
  await insert('courts', [
    { venue_id: venue[0].id, name: 'Court 1', sort_order: 1 },
    { venue_id: venue[0].id, name: 'Court 2', sort_order: 2 },
  ]);

  baseEvent = (over) => ({
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
  // E1 — scheduled americano (+3d), organizer maria; alex/joao/sofia confirmed, bruno waitlisted, pedro invited.
  const e1 = await rpc(jwt('maria'), 'create_event', { p_payload: baseEvent({
    name: 'Tuesday Americano', starts_at: isoIn(3),
    entrance_fee_enabled: true, entrance_fee_amount: 5, entrance_fee_method: 'cash',
    invitees: [{ invitee_id: id('pedro'), name: null, email: null, phone: null }],
  }) });
  for (const k of ['alex', 'joao', 'sofia']) await rpc(jwt(k), 'join_event', { p_event_id: e1 });
  // NOT waiting_list: capacity is num_courts*4 + standby_spots = 6 here, so
  // bruno lands confirmed with is_standby set. E9 below is the fixture that
  // actually reaches waiting_list.
  await rpc(jwt('bruno'), 'join_event', { p_event_id: e1 }); // confirmed, is_standby
  console.log(`  E1 scheduled americano = ${e1}`);

  // E2 — team event (+5d), organizer maria (organizing_only); sofia+bruno paired; rita→alex pending partner request.
  const e2 = await rpc(jwt('maria'), 'create_event', { p_payload: baseEvent({
    name: 'Team Cup', specification: 'team', organizer_role: 'organizing_only', starts_at: isoIn(5), num_courts: 1,
  }) });
  await rpc(jwt('sofia'), 'choose_partner', { p_event_id: e2, p_partner_user: id('bruno') });
  await rpc(jwt('rita'), 'request_partner', { p_event_id: e2, p_targets: [id('alex')] });
  console.log(`  E2 scheduled team = ${e2}`);

  // E3 — in-progress mexicano (started 2h ago), organizer alex; round 1 scored, round 2 pending, timer running, blast sent.
  const e3 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Live Mexicano', event_type: 'mexicano', starts_at: hoursFromNow(8),
  }) });
  for (const k of ['joao', 'sofia', 'bruno']) await rpc(jwt(k), 'join_event', { p_event_id: e3 });
  await rpc(jwt('alex'), 'start_event', { p_event_id: e3 });
  await patchEvent(e3, { starts_at: hoursFromNow(-2) });
  await scoreRound(jwt('alex'), e3);
  await rpc(jwt('alex'), 'generate_next_round', { p_event_id: e3 });
  await rpc(jwt('alex'), 'set_event_timer', { p_event_id: e3, p_action: 'start' });
  await rpc(jwt('alex'), 'send_event_blast', { p_event_id: e3, p_source_template_id: null, p_title: 'See you on court!', p_description: 'Round 2 starting soon — grab water.', p_image_path: null, p_channels: ['email'] });
  console.log(`  E3 in-progress mexicano = ${e3}`);

  // E4 — completed mexicano (-7d), organizer alex; finished + result posted.
  const e4 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Last Week Mexicano', event_type: 'mexicano', starts_at: hoursFromNow(8),
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

  // E5 — recurring weekly (+7d), organizer alex.
  const e5 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Weekly Friday Social', starts_at: isoIn(7, 18),
    series: { day_of_week: 5, start_time: '18:00', duration_minutes: 90, invite_lead_days: 5 },
  }) });
  for (const k of ['maria', 'joao']) await rpc(jwt(k), 'join_event', { p_event_id: e5 });
  console.log(`  E5 recurring = ${e5}`);

  // E6 — inside the 6h join cutoff (starts in ~3h), organizer alex; maria has a pending invite.
  const e6 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Cutoff Closing Soon', starts_at: hoursFromNow(3),
    invitees: [{ invitee_id: id('maria'), name: null, email: null, phone: null }],
  }) });
  console.log(`  E6 cutoff = ${e6}`);

  // E7 — full event (+2d): maria organizes+plays, joao/sofia/rita fill the last 3 spots → alex sees waitlist CTA.
  const e7 = await rpc(jwt('maria'), 'create_event', { p_payload: baseEvent({
    name: 'Full House', starts_at: isoIn(2),
  }) });
  for (const k of ['joao', 'sofia', 'rita']) await rpc(jwt(k), 'join_event', { p_event_id: e7 });
  console.log(`  E7 full = ${e7}`);

  // E8 — private standalone event (no group), organizer nina, no invitees → no-access for everyone else.
  const e8 = await rpc(jwt('nina'), 'create_event', { p_payload: baseEvent({
    group_id: null, is_private: true, name: 'Secret Standalone', starts_at: isoIn(4),
  }) });
  console.log(`  E8 private standalone = ${e8}`);

  // The four fixtures below exist because the RPCs cannot express what they set
  // up. E7/E6/E2 deliberately KEEP their auto-invitations — tests rely on the
  // invitee path too — so these are additions rather than edits.

  // E9 — full, with NO invitations and NO standby (+2d). Two things make the
  // waiting list reachable here, and both are needed:
  //   - invitations removed, so a group member arrives as a plain outsider
  //     rather than an invitee holding Accept/Decline (E7 is the same shape WITH
  //     them, deliberately);
  //   - allow_standby false, because event_capacity() is
  //     `num_courts * 4 + (allow_standby ? standby_spots : 0)`. With the default
  //     2 standby spots the cap is 6, so a 5th player joins CONFIRMED (flagged
  //     is_standby) and only a 7th would ever be waitlisted.
  const e9 = await rpc(jwt('maria'), 'create_event', { p_payload: baseEvent({
    name: 'Waitlist Only', starts_at: isoIn(2), allow_standby: false, standby_spots: null,
  }) });
  for (const k of ['joao', 'sofia', 'rita']) await rpc(jwt(k), 'join_event', { p_event_id: e9 });
  await suppressInvitations(e9);
  console.log(`  E9 full, invitations suppressed = ${e9}`);

  // E10 — inside the 6h join cutoff with NO invitations: E6 shows Accept/Decline
  // to every g1 member, so "Joining closed" needs a viewer holding no invitation.
  const e10 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Cutoff No Invites', starts_at: hoursFromNow(3),
  }) });
  await suppressInvitations(e10);
  console.log(`  E10 cutoff, invitations suppressed = ${e10}`);

  // E11 — in-progress TIME-scored event: the live screen only renders its Timer
  // tab when scoring_mode is 'time' (app/event/[id]/live.tsx), and every other
  // seeded event is 'points', so the timer UI had no fixture at all.
  const e11 = await rpc(jwt('alex'), 'create_event', { p_payload: baseEvent({
    name: 'Timed Americano', scoring_mode: 'time', scoring_value: 10, starts_at: hoursFromNow(8),
  }) });
  for (const k of ['joao', 'sofia', 'bruno']) await rpc(jwt(k), 'join_event', { p_event_id: e11 });
  await rpc(jwt('alex'), 'start_event', { p_event_id: e11 });
  await patchEvent(e11, { starts_at: hoursFromNow(-1) });
  console.log(`  E11 in-progress time-scored = ${e11}`);

  // E12 — team-spec with NO invitations (+6d): accepting an invitation leaves a
  // player "You're going" with a Leave CTA and no partner prompt, so the
  // partner-selection entry point only appears for a player who arrives without
  // one. E2 keeps its invitations for the inbox tests.
  //
  // Named to avoid the word "partner": the test looks for a partner CTA with a
  // /partner/i selector, and an event TITLE containing it would satisfy that
  // match on any screen and pass without the CTA ever rendering.
  const e12 = await rpc(jwt('maria'), 'create_event', { p_payload: baseEvent({
    name: 'Duo Selection', specification: 'team', organizer_role: 'organizing_only', starts_at: isoIn(6),
  }) });
  await suppressInvitations(e12);
  console.log(`  E12 team, invitations suppressed = ${e12}`);

  // 8) Review Club: three completed events so can_review_community unlocks (reviewer: joao).
  for (let i = 0; i < 3; i++) {
    await completedEvent('tiago', gR, `Review League #${i + 1}`, 14 - i * 3, ['joao', 'sofia', 'bruno']);
  }
  console.log('  3 completed events in Review Club');

  // 9) Fixture manifest — stable lookup for tests (avoids name-based selects).
  const manifest = {
    seededAt: new Date().toISOString(),
    users: Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.id])),
    communities: { A: commA, C: commC, P: commP, R: commR, S: commS },
    groups: { g1, g2, g3, gR, gS },
    events: { e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11, e12 },
  };
  console.log(`\nE2E_MANIFEST ${JSON.stringify(manifest)}`);

  // `select=*` rather than `select=id`: not every table has an id column —
  // `follows` is keyed on (follower_id, followee_id) — and PostgREST answers
  // `select=id` there with a 400, which this swallowed into a bare "?" in the
  // output. The count comes from the content-range header either way.
  const count = async (t) => {
    const r = await fetch(`${URL}/rest/v1/${t}?select=*`, { headers: { ...svc, Prefer: 'count=exact', Range: '0-0' } });
    return (r.headers.get('content-range') || '/?').split('/')[1];
  };
  console.log('Counts:');
  for (const t of ['profiles', 'communities', 'community_members', 'community_posts', 'groups', 'events', 'event_participants', 'follows', 'partner_requests', 'event_invitations', 'notifications']) {
    console.log(`  ${t}: ${await count(t)}`);
  }
}

main().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
