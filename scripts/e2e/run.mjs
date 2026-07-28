#!/usr/bin/env node
/**
 * PadelJam mobile E2E orchestrator.
 *
 *   pnpm --filter mobile e2e                 # full run
 *   pnpm --filter mobile e2e -- --suite 01   # one suite (prefix match)
 *   pnpm --filter mobile e2e -- --build-only # just (re)build + install
 *   pnpm --filter mobile e2e -- --no-build   # skip build freshness check
 *
 * Env: E2E_UDID, E2E_IDB_PATH, E2E_STREAM=1, E2E_OAUTH=1, E2E_PUSH_DELIVERY=1.
 * Requires: Docker + local Supabase stack running, Xcode installed.
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
function sourceHash() {
  const h = createHash('sha1');
  const roots = [join(MOBILE, 'app'), join(MOBILE, 'components'), join(MOBILE, 'lib'), join(MOBILE, 'constants'), join(MOBILE, 'app.json'), join(MOBILE, '.env')];
  const walk = (p) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const f of readdirSync(p)) walk(join(p, f));
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

// --- main -------------------------------------------------------------------
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
