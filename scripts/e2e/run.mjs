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
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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

const ENV = {
  ...process.env,
  DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer',
  LANG: 'en_US.UTF-8',
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
  const checks = [
    ['Supabase API', async () => (await fetch('http://127.0.0.1:55321/auth/v1/health')).ok],
    ['Mailpit', async () => (await fetch('http://127.0.0.1:55324/api/v1/info')).ok],
    ['Postgres', async () => spawnSync('docker', ['exec', 'supabase_db_padeljam', 'psql', '-U', 'postgres', '-c', 'select 1'], { env: ENV }).status === 0],
  ];
  for (const [name, fn] of checks) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (!ok) {
      die(`${name} is not reachable. Start the local stack first:\n  export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token\n  pnpm dlx supabase@latest --workdir "${join(ROOT, 'infra')}" start`);
    }
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
    } else {
      h.update(p);
      h.update(String(st.mtimeMs));
      h.update(String(st.size));
    }
  };
  roots.forEach(walk);
  // Package versions affect the bundle too.
  h.update(readFileSync(join(MOBILE, 'package.json')));
  return h.digest('hex');
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
disableExpoUpdates();
if (flag('--build-only')) { log('Build done.'); process.exit(0); }

log('Installing app…');
sh('xcrun', ['simctl', 'install', udid, APP_PATH]);

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
