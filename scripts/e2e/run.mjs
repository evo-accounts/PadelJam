#!/usr/bin/env node
/**
 * PadelJam mobile E2E orchestrator.
 *
 *   pnpm --filter mobile e2e                 # full run
 *   pnpm --filter mobile e2e -- --suite 01   # one suite (prefix match)
 *   pnpm --filter mobile e2e -- --build-only # just (re)build + install
 *   pnpm --filter mobile e2e -- --no-build   # skip build freshness check
 *   pnpm --filter mobile e2e -- --wait       # queue behind a running suite instead of failing
 *
 * Only ONE run may hold the simulator + local Supabase at a time; a second run
 * fails fast (or queues with --wait) rather than silently corrupting both.
 *
 * Env: E2E_UDID, E2E_IDB_PATH, E2E_STREAM=1, E2E_OAUTH=1, E2E_PUSH_DELIVERY=1.
 * Requires: Docker + local Supabase stack running, Xcode installed.
 */
import { execFileSync, execSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const MOBILE = join(ROOT, 'apps', 'mobile');
const DERIVED = join(MOBILE, '.e2e-derived');
const APP_PATH = join(DERIVED, 'Build', 'Products', 'Release-iphonesimulator', 'PadelJam.app');
const STAMP = join(DERIVED, 'source-stamp.txt');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

// Storybook is compiled into every E2E build so suite 00 can screenshot the
// design-system gallery on a real device. It costs ~2.9 MB of bundle and adds
// one route that nothing links to, so the other 13 suites exercise exactly the
// app they did before. Enabled unconditionally rather than per-suite because the
// build is shared: a per-suite flag would mean two builds and a stale-artifact
// trap the first time someone ran them in the wrong order.
//
// STORYBOOK_DISABLE_TELEMETRY: Storybook phones home anonymously by default.
// CI machines should not.
/**
 * The `EXPO_PUBLIC_*` values that `apps/mobile/.env` holds, so they can be put
 * into the environment we hand to xcodebuild.
 *
 * Expo CLI already reads that file at bundle time, so this looks redundant — it
 * is not. Metro runs its babel transforms in WORKER processes, and the
 * `EXPO_PUBLIC_*` inlining happens there, against the env each worker was
 * spawned with. Loading a .env into the CLI process does not reach them.
 *
 * Measured on CI 2026-09-09 (run 34354428689): the build logged
 *   env: load .env
 *   env: export EXPO_PUBLIC_APP_ENV EXPO_PUBLIC_SUPABASE_ANON_KEY EXPO_PUBLIC_SUPABASE_URL
 * and the bundle it produced still contained
 *   createPublicEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined })
 * The app threw `[@padel/config] Invalid environment` before rendering anything,
 * so all 13 suites failed in their hook with a bare
 * `waitFor timed out ... {"text":{}}` — 40 minutes to say "the app never
 * started". Hence assertPublicEnvInlined() below.
 *
 * Putting the values in OUR env fixes it: xcodebuild, its script phase, the
 * Expo CLI and every Metro worker beneath it all inherit them. That is exactly
 * why EXPO_PUBLIC_STORYBOOK has always inlined correctly and these did not.
 *
 * The file wins over an inherited variable of the same name: it is generated
 * from the stack that is actually running, and a stale shell export pointing at
 * a different Supabase is precisely the confusion worth ruling out.
 */
function publicEnvFromMobileDotenv() {
  const file = join(MOBILE, '.env');
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || !m[1].startsWith('EXPO_PUBLIC_')) continue;
    out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const ENV = {
  ...process.env,
  ...publicEnvFromMobileDotenv(),
  DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer',
  LANG: 'en_US.UTF-8',
  EXPO_PUBLIC_STORYBOOK: '1',
  STORYBOOK_DISABLE_TELEMETRY: '1',
};

const log = (msg) => console.log(`[e2e] ${msg}`);
const die = (msg) => { console.error(`[e2e] ERROR: ${msg}`); process.exit(1); };

function sh(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { env: ENV, encoding: 'utf8', stdio: opts.inherit ? 'inherit' : 'pipe', ...opts });
}

// --- 0. Hold the shared-stack lock -----------------------------------------
// There is exactly ONE target simulator and ONE local Supabase on a dev machine,
// and a run owns both: it installs over the app and `resetDb()` rotates every
// seeded id. Two concurrent runs therefore corrupt each other SILENTLY — the
// symptoms look like app bugs (a persona bounced to sign-in because its user id
// no longer exists, stray characters typed into the other run's fields), which
// is exactly how this cost two sessions most of a morning. Fail fast instead.
// Deliberately a FIXED machine-wide path, not os.tmpdir(): $TMPDIR is per-session
// on macOS (/var/folders/…), so two shells can resolve it differently and each
// take "the" lock — failing open, which is worse than no lock at all.
const LOCK = '/tmp/padeljam-e2e.lock';

/** The lock holder is live only if its pid is alive AND still an e2e run (pids get reused). */
function lockHolder() {
  let raw;
  try { raw = readFileSync(LOCK, 'utf8'); } catch { return null; }
  let info;
  try { info = JSON.parse(raw); } catch { return null; }
  if (!info?.pid) return null;
  try { process.kill(info.pid, 0); } catch { return null; } // dead pid → stale
  const cmd = spawnSync('ps', ['-p', String(info.pid), '-o', 'command='], { encoding: 'utf8' }).stdout ?? '';
  return /run\.mjs/.test(cmd) ? info : null;
}

function describeHolder(h) {
  const mins = Math.round((Date.now() - Date.parse(h.startedAt)) / 60000);
  return `pid ${h.pid}, started ${Number.isFinite(mins) ? `${mins} min ago` : h.startedAt}`
    + `${h.suite ? `, suite ${h.suite}` : ', all suites'}`;
}

function acquireLock() {
  for (;;) {
    try {
      writeFileSync(
        LOCK,
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), cwd: ROOT, suite: opt('--suite') ?? null }),
        { flag: 'wx' }, // exclusive create: loses the race rather than clobbering
      );
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const holder = lockHolder();
    if (!holder) { // stale lock from a killed run
      try { unlinkSync(LOCK); } catch { /* another run reclaimed it first */ }
      continue;
    }
    if (!flag('--wait')) {
      die('another E2E run holds the simulator + local Supabase.\n'
        + `  holder: ${describeHolder(holder)}\n`
        + `  cwd:    ${holder.cwd}\n`
        + '  Running both corrupts BOTH sets of results — it installs over your app and\n'
        + '  resetDb() rotates the seeded ids underneath you. Wait for it, or use --wait to queue.\n'
        + `  If you are certain it is gone: rm ${LOCK}`);
    }
    log(`Waiting for the shared stack — ${describeHolder(holder)}`);
    execFileSync('sleep', ['15']);
  }
}

function releaseLock() {
  try {
    const info = JSON.parse(readFileSync(LOCK, 'utf8'));
    if (info.pid === process.pid) unlinkSync(LOCK); // never drop a lock we requeued to someone else
  } catch { /* already gone */ }
}

acquireLock();
process.on('exit', releaseLock);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { releaseLock(); process.exit(130); });
}

// --- 1. Resolve simulator ---------------------------------------------------
function resolveUdid() {
  if (process.env.E2E_UDID) return process.env.E2E_UDID;
  const list = JSON.parse(sh('xcrun', ['simctl', 'list', 'devices', '-j']));
  const preferred = '5D4B52E5-ED02-46F7-94FD-FEB1A3F52877';
  const all = Object.values(list.devices).flat();
  if (all.some((d) => d.udid === preferred && d.isAvailable)) return preferred;
  const iphone = all.find((d) => d.isAvailable && /iPhone/.test(d.name));
  if (!iphone) die('No available iPhone simulator found. Create one in Xcode.');
  return iphone.udid;
}

// --- 2. Preflight the stack -------------------------------------------------
async function preflight() {
  const stackHint = `Start the local stack first:\n  export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token\n  pnpm dlx supabase@latest --workdir "${join(ROOT, 'infra')}" start`;

  // A stack that is "already running" can still be missing pieces: `supabase
  // start` reports a container that died as an informational
  //   Stopped services: [supabase_edge_runtime_padeljam ...]
  // and still exits 0, so nothing repairs it and nothing fails.
  //
  // Measured 2026-09-09 (run 34377160736): the edge runtime had been down since
  // a Docker restart hours earlier. Every /functions/v1/* URL answered 503
  // because Kong had no upstream, and suite 01 failed on a bare
  // `complete-account-failed:503` after the account-creation Edge Function was
  // simply not served. Worth one HTTP call up front.
  const edgeHint = 'The stack is up but the Edge Functions runtime is not.\n'
    + '  `supabase start` reports this as "Stopped services: [...]" and still exits 0,\n'
    + '  so re-running it will NOT fix this. Restart the container directly:\n'
    + '    docker start supabase_edge_runtime_padeljam';

  const checks = [
    ['Supabase API', async () => (await fetch('http://127.0.0.1:55321/auth/v1/health')).ok, stackHint],
    ['Mailpit', async () => (await fetch('http://127.0.0.1:55324/api/v1/info')).ok, stackHint],
    ['Postgres', async () => spawnSync('docker', ['exec', 'supabase_db_padeljam', 'psql', '-U', 'postgres', '-c', 'select 1'], { env: ENV }).status === 0, stackHint],
    // 503 = Kong has no upstream for /functions/v1, i.e. the runtime is down.
    // A served function answers 401 without a JWT; a missing one answers 404.
    // Both mean the runtime is up, which is all this checks.
    ['Edge Functions', async () => {
      const r = await fetch('http://127.0.0.1:55321/functions/v1/complete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return r.status !== 503;
    }, edgeHint],
  ];
  for (const [name, fn, hint] of checks) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (!ok) die(`${name} is not reachable. ${hint}`);
    log(`${name} ✓`);
  }
  const idbPath = process.env.E2E_IDB_PATH ?? join(homedir(), 'Library/Python/3.9/bin/idb');
  if (!existsSync(idbPath)) die(`idb not found at ${idbPath} (pip3 install --user fb-idb; set E2E_IDB_PATH to override).`);
  log('idb ✓');
}

// --- 3. Build freshness -----------------------------------------------------
// The workspace packages are compiled into the embedded JS bundle, so edits under
// packages/*/src must invalidate the stamp too — otherwise the run silently tests
// stale code. Resolved transitively from package.json rather than hard-coded, so a
// new @padel/* dependency is picked up without touching this file.
function workspacePackageDirs() {
  const dirByName = new Map();
  const pkgRoot = join(ROOT, 'packages');
  for (const entry of existsSync(pkgRoot) ? readdirSync(pkgRoot) : []) {
    const manifest = join(pkgRoot, entry, 'package.json');
    if (!existsSync(manifest)) continue;
    dirByName.set(JSON.parse(readFileSync(manifest, 'utf8')).name, join(pkgRoot, entry));
  }
  const found = new Set();
  const visit = (manifest) => {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })) {
      const dir = dirByName.get(dep);
      if (!dir || found.has(dir)) continue;
      found.add(dir);
      visit(join(dir, 'package.json'));
    }
  };
  visit(join(MOBILE, 'package.json'));
  return [...found];
}

function sourceHash() {
  const h = createHash('sha1');
  const roots = [join(MOBILE, 'app'), join(MOBILE, 'components'), join(MOBILE, 'lib'), join(MOBILE, 'constants'), join(MOBILE, 'app.json'), join(MOBILE, '.env')];
  for (const dir of workspacePackageDirs()) roots.push(join(dir, 'src'), join(dir, 'package.json'));
  const walk = (p) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) {
      // Sorted: readdir order is not guaranteed, and an unstable order would make
      // the stamp differ between runs over identical sources.
      for (const f of readdirSync(p).sort()) walk(join(p, f));
    } else if (p.endsWith('.env')) {
      // CONTENT, not mtime. CI regenerates apps/mobile/.env from `supabase
      // status` on every run, so its mtime always differs and an mtime-based
      // stamp can never match — measured: three consecutive CI runs, including
      // reruns of the SAME commit, all logged "Building Release" and never
      // "Build is fresh", paying a full xcodebuild for nothing. The file's
      // contents are what actually get inlined into the bundle.
      h.update(p);
      h.update(readFileSync(p));
    } else {
      h.update(p);
      h.update(String(st.mtimeMs));
      h.update(String(st.size));
    }
  };
  roots.forEach(walk);
  // Package versions affect the bundle too.
  h.update(readFileSync(join(MOBILE, 'package.json')));
  // EXPO_PUBLIC_* values are INLINED into the bundle at build time, so two
  // builds from identical sources are different artifacts if the flag differs.
  // Without this the stamp would call a pre-Storybook build "fresh" and suite 00
  // would drive an app that has no /storybook route — a confusing failure a long
  // way from its cause.
  h.update(`EXPO_PUBLIC_STORYBOOK=${ENV.EXPO_PUBLIC_STORYBOOK ?? ''}`);
  return h.digest('hex');
}

/** Delete all but the newest `keep` timestamped artifact dirs. */
function pruneArtifacts(root, keep) {
  if (!existsSync(root)) return;
  const dirs = readdirSync(root)
    .filter((n) => statSync(join(root, n)).isDirectory())
    .sort() // ISO-8601 names sort chronologically
    .slice(0, -keep);
  for (const d of dirs) {
    try { rmSync(join(root, d), { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  if (dirs.length) log(`Pruned ${dirs.length} old artifact dir(s)`);
}

function buildIfStale(udid) {
  const hash = sourceHash();
  if (existsSync(APP_PATH) && existsSync(STAMP) && readFileSync(STAMP, 'utf8') === hash && !flag('--force-build')) {
    log('Build is fresh — skipping xcodebuild');
    return;
  }
  log('Building Release for simulator (this takes a few minutes)…');
  if (!existsSync(join(MOBILE, 'ios', 'Pods'))) {
    log('Pods missing — running pod install');
    sh('/usr/local/bin/pod', ['install'], { cwd: join(MOBILE, 'ios'), inherit: true });
  }
  sh('xcodebuild', [
    '-workspace', join(MOBILE, 'ios', 'PadelJam.xcworkspace'),
    '-scheme', 'PadelJam',
    '-configuration', 'Release',
    '-destination', `platform=iOS Simulator,id=${udid}`,
    '-derivedDataPath', DERIVED,
    'build',
  ], { inherit: true });
  mkdirSync(dirname(STAMP), { recursive: true });
  writeFileSync(STAMP, hash);
}

/**
 * Fail in seconds, with the cause named, when the build did not inline the
 * Supabase env — instead of handing the suites an app that dies on launch and
 * letting every one of them time out on a selector that never appears.
 *
 * Hermes keeps string literals in its string table, so a plain substring search
 * works on the bytecode bundle exactly as it does on a plain-text one.
 */
function assertPublicEnvInlined() {
  const bundle = join(APP_PATH, 'main.jsbundle');
  // A Debug build loads JS from Metro and embeds nothing — nothing to check.
  if (!existsSync(bundle)) return;
  const url = ENV.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) {
    die('EXPO_PUBLIC_SUPABASE_URL is not set.\n'
      + `  apps/mobile/.env is missing or has no EXPO_PUBLIC_* keys (${join(MOBILE, '.env')}).`);
  }
  if (!readFileSync(bundle, 'latin1').includes(url)) {
    die(`the built app does not contain ${url}.\n`
      + '  EXPO_PUBLIC_* was not inlined, so the app will throw\n'
      + '  "[@padel/config] Invalid environment" before it renders anything and\n'
      + '  every suite will fail in its hook on a selector that never appears.\n'
      + '  Check apps/mobile/.env, then rerun with --force-build.');
  }
  log('build carries the expected EXPO_PUBLIC_* values');
}

// E2E builds must NEVER talk to EAS Updates: a remote bundle (with production env
// inlined) silently replacing the local one mid-run destroys determinism.
function disableExpoUpdates() {
  const plist = join(APP_PATH, 'Expo.plist');
  if (!existsSync(plist)) return;
  execFileSync('plutil', ['-replace', 'EXUpdatesEnabled', '-bool', 'NO', plist]);
  execFileSync('plutil', ['-replace', 'EXUpdatesCheckOnLaunch', '-string', 'NEVER', plist]);
  log('expo-updates disabled in E2E build');
}

/**
 * Hold a power assertion for the lifetime of this run.
 *
 * A full suite takes ~25 minutes and spends most of it waiting — polling the
 * accessibility tree, sleeping between taps — so it holds no CPU assertion and
 * macOS is free to idle-sleep straight through it. Nothing here keeps the
 * machine awake either: `pmset -g assertions` during a run shows
 * PreventSystemSleep 0, and the only thing holding the Mac up is powerd's
 * "Prevent sleep while display is on". Which is exactly why this never
 * reproduces while you are sitting in front of it, and bites the unattended
 * nightly.
 *
 * The damage is not the pause. On wake, Docker Desktop corrects the Linux VM's
 * clock BACKWARD, and any JWT minted either side of that correction is then
 * "issued at future" to a validator sharing that clock — so GoTrue hands out a
 * token PostgREST refuses. It surfaces as an auth failure on the OTP screen of
 * whichever suite happened to be signing in at that moment, which is why it
 * looked random: three consecutive CI runs failed this way in suites 01, 04 and
 * 06, each one green on its own.
 *
 * `-w <pid>` ties caffeinate's lifetime to ours, so it cannot outlive a crash
 * and leave the machine awake for good.
 */
function preventSleep() {
  if (process.platform !== 'darwin') return;
  try {
    spawn('caffeinate', ['-dimsu', '-w', String(process.pid)], { detached: true, stdio: 'ignore' }).unref();
    log('Holding a power assertion for this run (caffeinate)');
  } catch {
    log('WARNING: could not start caffeinate — a mid-run sleep may cause "JWT issued at future"');
  }
}

// --- main -------------------------------------------------------------------
preventSleep();
const udid = resolveUdid();
log(`Simulator: ${udid}`);
await preflight();

log('Booting simulator…');
try { sh('xcrun', ['simctl', 'boot', udid]); } catch { /* already booted */ }
sh('xcrun', ['simctl', 'bootstatus', udid, '-b']);
try { sh('xcrun', ['simctl', 'status_bar', udid, 'override', '--time', '9:41', '--batteryLevel', '100', '--batteryState', 'charged']); } catch { /* cosmetic */ }

if (!flag('--no-build')) buildIfStale(udid);
assertPublicEnvInlined();
disableExpoUpdates();
if (flag('--build-only')) { log('Build done.'); process.exit(0); }

log('Installing app…');
sh('xcrun', ['simctl', 'install', udid, APP_PATH]);

// Keep only the most recent runs. Artifact dirs are never cleaned otherwise
// (157 had piled up here), and on the self-hosted runner actions/checkout uses
// clean:false, so upload-artifact bundles every past run's failures alongside
// this one's — dirs from days ago, for tests that passed today.
//
// 10 rather than a tighter number on purpose: these are the only record of what
// a screen looked like when something failed, and a two-day-old one was what
// pinned down the pager geometry behind the backGesture fix. Bounded, not scarce.
pruneArtifacts(join(MOBILE, 'e2e', 'artifacts'), 10);
const artifacts = join(MOBILE, 'e2e', 'artifacts', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(artifacts, { recursive: true });

const suite = opt('--suite');
const vitestArgs = ['exec', 'vitest', 'run', '-c', 'e2e/vitest.e2e.config.ts'];
if (suite) vitestArgs.push(`suites/${suite}`);

log(`Running suites${suite ? ` (filter: ${suite})` : ''}…`);
const res = spawnSync('pnpm', vitestArgs, {
  cwd: MOBILE,
  stdio: 'inherit',
  env: {
    ...ENV,
    E2E_UDID: udid,
    E2E_APP_PATH: APP_PATH,
    E2E_ARTIFACTS_DIR: artifacts,
  },
});

log(`Artifacts: ${artifacts}`);
process.exit(res.status ?? 1);
