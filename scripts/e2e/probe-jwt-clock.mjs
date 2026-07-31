#!/usr/bin/env node
/**
 * PadelJam — PostgREST JWT clock probe.
 *
 *   node scripts/e2e/probe-jwt-clock.mjs --gap 45 --iterations 40
 *   node scripts/e2e/probe-jwt-clock.mjs --gap 700 --iterations 4
 *   node scripts/e2e/probe-jwt-clock.mjs --gap 45 --iterations 20 --load
 *
 * WHY THIS EXISTS
 *
 * The E2E suite fails intermittently with PostgREST's `PGRST303 JWT issued at
 * future` (HTTP 401) — roughly one run in three, always a different suite,
 * always green on re-run. Diagnosing it through the suite costs ~25 minutes per
 * coin flip and it has already been misdiagnosed three times. This reproduces
 * and MEASURES the condition in seconds, with no simulator, no app build and no
 * idb.
 *
 * THE HYPOTHESIS UNDER TEST
 *
 * PostgREST validates `iat` against a CACHED clock that is refreshed by a timer.
 * If that timer starves while the stack is idle, its "now" lags real time; a
 * freshly minted token then looks future-dated and is rejected once the lag
 * exceeds PostgREST's fixed 30s allowance (measured: iat=now+30s -> 200,
 * iat=now+31s -> 401; there is no config knob for it in v14.15).
 *
 * TWO INDEPENDENT MEASUREMENTS PER IDLE WINDOW
 *
 *   1. skewMs  — hostNow minus the `Date` response header. Kong forwards
 *                PostgREST's own header (verified: `Server: postgrest/14.15`
 *                comes through), and Warp generates it from a cached clock too,
 *                so this reads the staleness directly and costs nothing.
 *   2. ladder  — tokens with iat = hostNow - k for a range of k, fired
 *                CONCURRENTLY. A token is rejected when (staleness - k) > 30, so
 *                the largest failing k gives staleness = k + 30.
 *
 * The ladder must be concurrent: the FIRST request through PostgREST refreshes
 * the clock, so there is exactly one measurement per idle window. Anything that
 * polls — a health check, dbHealthy(), even curl — destroys the thing being
 * measured. For the same reason this must not run while a suite is running,
 * whose own traffic would keep the clock warm.
 */
import { createHmac } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);

const GAP_S = Number(opt('--gap', '45'));
const ITERATIONS = Number(opt('--iterations', '20'));
const MODE = opt('--mode', 'synthetic'); // synthetic | grant
const OUT = opt('--out', resolve(ROOT, 'apps/mobile/e2e/artifacts/jwt-clock-probe.jsonl'));
const REST_CONTAINER = process.env.E2E_REST_CONTAINER ?? 'supabase_rest_padeljam';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const LOCK = '/tmp/padeljam-e2e.lock';

const log = (m) => console.log(`[probe] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// --- refuse to run alongside a suite ----------------------------------------
// Not to take the lock — this owns nothing — but because a concurrent suite's
// traffic keeps PostgREST's clock warm, which would mask the very condition we
// are trying to catch (and our traffic would equally mask it for the suite).
function assertStackIdle() {
  let raw;
  try { raw = readFileSync(LOCK, 'utf8'); } catch { return; }
  let info;
  try { info = JSON.parse(raw); } catch { return; }
  if (!info?.pid) return;
  try { process.kill(info.pid, 0); } catch { return; } // stale
  console.error(
    `[probe] ERROR: an E2E run holds ${LOCK} (pid ${info.pid}).\n`
    + '  Its traffic keeps PostgREST warm, so the probe would measure nothing —\n'
    + '  and the probe\'s own traffic would hide the bug from that run. Wait for it.',
  );
  process.exit(1);
}

// --- keys -------------------------------------------------------------------
/** The `oct` (HMAC) key PostgREST already trusts, read from its own env. */
function octSecret() {
  const env = execFileSync('docker', ['inspect', REST_CONTAINER, '--format', '{{range .Config.Env}}{{println .}}{{end}}'], { encoding: 'utf8' });
  const line = env.split('\n').find((l) => l.startsWith('PGRST_JWT_SECRET='));
  if (!line) throw new Error(`PGRST_JWT_SECRET not found on ${REST_CONTAINER}`);
  const jwks = JSON.parse(line.slice('PGRST_JWT_SECRET='.length));
  const keys = Array.isArray(jwks) ? jwks : (jwks.keys ?? [jwks]);
  const oct = keys.find((k) => k.kty === 'oct' && k.k);
  if (!oct) throw new Error('no oct key in PGRST_JWT_SECRET — use --mode grant');
  return Buffer.from(oct.k, 'base64url');
}

/**
 * HS256 token with a controllable `iat`. Signed with the key PostgREST already
 * trusts, so it needs no GoTrue round-trip and writes NOTHING to the database —
 * the probe can loop for an hour without disturbing seeded state.
 */
function mintSynthetic(secret, { iatDelta = 0 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    role: 'authenticated',
    aud: 'authenticated',
    sub: '00000000-0000-0000-0000-000000000000',
    iat: now + iatDelta,
    exp: now + 3600,
  }));
  const sig = b64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

/** A real GoTrue token (ES256), for end-to-end fidelity. WRITES auth.sessions. */
async function mintViaGrant() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey() },
    body: JSON.stringify({ email: 'demo@padeljam.test', password: 'demo1234' }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`grant failed: ${JSON.stringify(body).slice(0, 200)}`);
  const claims = JSON.parse(Buffer.from(body.access_token.split('.')[1], 'base64url').toString());
  return { token: body.access_token, iat: claims.iat };
}

function anonKey() {
  if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY;
  for (const f of ['.env', 'apps/mobile/.env']) {
    try {
      const m = readFileSync(resolve(ROOT, f), 'utf8').match(/^(?:EXPO_PUBLIC_)?SUPABASE_ANON_KEY=(.*)$/m);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    } catch { /* next */ }
  }
  throw new Error('SUPABASE_ANON_KEY not found in env or .env files');
}

// --- measurement ------------------------------------------------------------
/** One request. `skewMs` is hostNow minus PostgREST's own Date header. */
async function shot(token, key, label) {
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    return { label, error: String(e).slice(0, 120) };
  }
  const hostNowMs = Date.now();
  const dateHdr = res.headers.get('date');
  const restDateMs = dateHdr ? Date.parse(dateHdr) : null;
  let code = null;
  if (!res.ok) {
    try { code = (await res.json()).code ?? null; } catch { /* non-JSON */ }
  }
  return {
    label,
    status: res.status,
    code,
    server: res.headers.get('server'),
    rttMs: hostNowMs - t0,
    // Date has 1s resolution, so this is +/-1000ms — enough to see a lag of tens
    // of seconds, useless for sub-second claims. Do not over-read it.
    skewMs: restDateMs === null ? null : hostNowMs - restDateMs,
  };
}

/**
 * Fire the whole ladder at once. A token with iat = now-k is rejected when
 * (staleness - k) > 30, so the largest failing k gives staleness = k + 30.
 * Concurrent because the first request to land refreshes PostgREST's clock.
 */
const LADDER = [0, 15, 30, 60, 120, 300, 900];
async function ladder(secret, key) {
  return Promise.all(LADDER.map((k) => shot(mintSynthetic(secret, { iatDelta: -k }), key, `iat-${k}s`)));
}

/** Container clocks. rest has GNU date (%N works); auth/db are busybox (no %N). */
function clocks() {
  const one = (c, fmt) => {
    try { return execFileSync('docker', ['exec', c, 'date', '-u', `+${fmt}`], { encoding: 'utf8', timeout: 10_000 }).trim(); }
    catch { return null; }
  };
  let loadavg = null;
  try { loadavg = execFileSync('docker', ['exec', REST_CONTAINER, 'cat', '/proc/loadavg'], { encoding: 'utf8', timeout: 10_000 }).trim(); }
  catch { /* best-effort */ }
  return {
    hostMs: Date.now(),
    rest: one(REST_CONTAINER, '%s.%N'),
    auth: one('supabase_auth_padeljam', '%s'),
    db: one('supabase_db_padeljam', '%s'),
    loadavg,
  };
}

/** Optional CPU pressure, to test whether starvation modulates the drift. */
function startLoad() {
  const kids = [];
  for (let i = 0; i < 4; i++) {
    kids.push(spawn('/bin/sh', ['-c', 'while :; do :; done'], { stdio: 'ignore', detached: true }));
  }
  return () => kids.forEach((k) => { try { process.kill(-k.pid, 'SIGKILL'); } catch { /* already gone */ } });
}

// --- main -------------------------------------------------------------------
assertStackIdle();

const key = anonKey();
const secret = MODE === 'synthetic' ? octSecret() : null;
let stopLoad = () => {};
if (flag('--load')) { stopLoad = startLoad(); log('CPU load generator running'); }

log(`mode=${MODE} gap=${GAP_S}s iterations=${ITERATIONS} out=${OUT}`);
log(`ladder k = [${LADDER.join(', ')}]  (staleness = failing k + 30)`);
log('NOTE: no traffic to the stack during the idle window — that is the measurement.');

let hits = 0;
for (let i = 1; i <= ITERATIONS; i++) {
  await sleep(GAP_S * 1000); // the idle window. Nothing may touch :55321 here.
  const shots = MODE === 'grant'
    ? [await (async () => { const g = await mintViaGrant(); return shot(g.token, key, `grant(iat=${g.iat})`); })()]
    : await ladder(secret, key);
  const after = clocks();
  const failed = shots.filter((s) => s.status === 401 && s.code === 'PGRST303');
  const worst = failed.map((s) => Number(s.label.replace(/^iat-|s$/g, ''))).sort((a, b) => b - a)[0];
  const record = {
    iteration: i,
    gapS: GAP_S,
    at: new Date(after.hostMs).toISOString(),
    failures: failed.length,
    stalenessS: worst === undefined ? null : worst + 30,
    headerSkewMs: shots.find((s) => s.skewMs != null)?.skewMs ?? null,
    shots,
    clocks: after,
  };
  appendFileSync(OUT, `${JSON.stringify(record)}\n`);
  if (failed.length) {
    hits++;
    log(`#${i} HIT — ${failed.length}/${shots.length} rejected, staleness>=${record.stalenessS}s, headerSkew=${record.headerSkewMs}ms`);
  } else {
    log(`#${i} clean — headerSkew=${record.headerSkewMs}ms`);
  }
}

stopLoad();
log(`done: ${hits}/${ITERATIONS} iterations reproduced PGRST303. Raw: ${OUT}`);
