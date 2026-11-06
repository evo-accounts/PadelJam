#!/usr/bin/env node
/**
 * Starts Docker (OrbStack) if it isn't answering, brings the e2e Supabase stack up and writes the two .env files the run reads.
 *
 *   node scripts/e2e/ci-stack.mjs [--stack ci|dev]     (default: ci)
 *
 * The workflow step runs exactly this, so changes here need no workflow edit. It never runs `stop`.
 * Outside GitHub, on the company Mac, `start` queues for a slot through stack-slot. If none comes
 * free this exits 75 having started nothing and written no .env: "not run", not a failure.
 * STACK_SLOT_WAIT sets how many seconds to queue (stack-slot's default is an hour).
 * After stopping a stack started that way, run `stack-slot release <project>`.
 * To remove the CI stack by hand, with the CI env set (never a bare `supabase stop`: it takes down
 * whichever stack the directory's config.toml names, i.e. the agents' one):
 *   pnpm dlx supabase@2.117.0 --workdir infra stop --project-id padeljam_ci --no-backup
 */
import { execFileSync } from 'node:child_process';
import { accessSync, constants, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';
import { ensureDocker } from './docker.mjs';
import { NO_SLOT_EXIT, STACK_SLOT, heldByForeignStack, resolveStack, slotted } from './stack.mjs';

const SUPABASE_CLI_VERSION = '2.117.0'; // keep in step with infra/supabase/README.md and apps/mobile/e2e/README.md

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const stackName = args.includes('--stack') ? args[args.indexOf('--stack') + 1] : 'ci';
const stack = resolveStack(stackName);

const env = {
  ...process.env,
  SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN: 'local_test_token',
  // INCIDENT 2026-09-11: every run failed with "No matching Supabase CLI binary package found for
  // darwin-arm64". pnpm caches `dlx` installs under ~/Library/Caches/pnpm/dlx/<hash of the RESOLVED
  // version>, shared by every process on the machine regardless of CPU arch, and reused for 24h.
  // The developer's shell on this Mac runs an Intel Homebrew Node under Rosetta (x64), while the
  // runner's setup-node is arm64. Whichever repopulates the entry first after it expires decides
  // which @supabase/cli-darwin-* optional package is in it, and the other arch then fails. Pinning
  // the version does not change the cache key, so the job gets its own pnpm cache dir that no
  // developer shell writes to. It is persistent, so the CLI is downloaded once.
  npm_config_cache_dir: join(homedir(), 'Library', 'Caches', 'pnpm-e2e-runner'),
  ...stack.cliEnv,
};

const supabaseCmd = (...cmd) => ['pnpm', 'dlx', `supabase@${SUPABASE_CLI_VERSION}`, '--workdir', join(ROOT, 'infra'), ...cmd];
const supabase = (...cmd) => {
  const [file, ...fileArgs] = supabaseCmd(...cmd);
  return execFileSync(file, fileArgs, { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
};

console.log(`[ci-stack] stack: ${stack.name} (${stack.projectId}, ${stack.apiUrl})`);

const dockerUp = () => {
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch { return false; }
};
const startOrbStack = () => {
  console.log('[ci-stack] Docker is not answering; starting OrbStack.');
  try {
    execFileSync('open', ['-g', '-a', 'OrbStack'], { stdio: 'ignore', timeout: 10_000 });
  } catch (e) {
    console.log(`[ci-stack] could not start OrbStack: ${e.message}`);
  }
};
if (!(await ensureDocker({ isUp: dockerUp, start: startOrbStack, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) }))) {
  const msg = 'Docker did not answer within 2 minutes, even after starting OrbStack. Log in to the runner Mac as joaopaulos4, open OrbStack, check that `docker ps` works there, then re-run this job.';
  console.error(`::error::${msg}`);
  console.error(`[ci-stack] ERROR: ${msg}`);
  process.exit(1);
}

const portOpen = (port) => new Promise((done) => {
  const sock = connect({ host: '127.0.0.1', port, timeout: 1000 });
  sock.once('connect', () => { sock.destroy(); done(true); });
  sock.once('error', () => done(false));
  sock.once('timeout', () => { sock.destroy(); done(false); });
});
if (stack.name !== 'dev') {
  const [apiOpen, dbOpen] = await Promise.all([portOpen(stack.apiPort), portOpen(stack.dbPort)]);
  if (apiOpen || dbOpen) {
    const containers = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).split('\n');
    if (heldByForeignStack(stack, { apiOpen, dbOpen, containers })) {
      console.error(`[ci-stack] ERROR: ${stack.apiUrl} or its database port is already in use, and this Docker has no ${stack.dbContainer}. Another user's stack holds the ports, most likely the e2e runner's. Wait for its job to finish (gh run list --workflow e2e-mobile.yml --status in_progress; /tmp/padeljam-e2e.lock). Not running start, no .env written.`);
      process.exit(1);
    }
  }
}
const slotsUsable = () => {
  try {
    accessSync(STACK_SLOT, constants.X_OK);
    accessSync(join(dirname(STACK_SLOT), 'state'), constants.W_OK);
    return true;
  } catch { return false; }
};
const [startFile, ...startArgs] = slotted(env.SUPABASE_PROJECT_ID ?? stack.projectId, supabaseCmd('start'), {
  githubActions: process.env.GITHUB_ACTIONS === 'true',
  slotsUsable: slotsUsable(),
  wait: process.env.STACK_SLOT_WAIT,
});
try {
  execFileSync(startFile, startArgs, { cwd: ROOT, env, stdio: ['ignore', 'inherit', 'inherit'] });
} catch (e) {
  if (e.status === NO_SLOT_EXIT) {
    console.error('[ci-stack] no stack slot came free: not run, not a failure. Nothing started, no .env written. Try again later.');
    process.exit(NO_SLOT_EXIT);
  }
  throw e;
}
const status = supabase('status', '-o', 'env');

const vars = {};
for (const line of status.split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}

if (vars.API_URL !== stack.apiUrl) {
  console.error(`[ci-stack] ERROR: status reports API_URL=${vars.API_URL ?? '(none)'}, but stack "${stack.name}" is ${stack.apiUrl}. Not writing any .env.`);
  process.exit(1);
}
for (const k of ['SERVICE_ROLE_KEY', 'PUBLISHABLE_KEY']) {
  if (!vars[k]) {
    console.error(`[ci-stack] ERROR: status reports no ${k}. Not writing any .env.`);
    process.exit(1);
  }
}

// The repo-root .env: the seed and the suite read the service-role key from here. This checkout is
// the runner's own workspace, so it starts with none.
writeFileSync(join(ROOT, '.env'), [
  `SUPABASE_URL=${vars.API_URL}`,
  `SUPABASE_SERVICE_ROLE_KEY=${vars.SERVICE_ROLE_KEY}`,
  `SUPABASE_ANON_KEY=${vars.PUBLISHABLE_KEY}`,
  '',
].join('\n'));
// The bundle inlines EXPO_PUBLIC_* at build time.
writeFileSync(join(ROOT, 'apps', 'mobile', '.env'), [
  `EXPO_PUBLIC_SUPABASE_URL=${stack.apiUrl}`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY=${vars.PUBLISHABLE_KEY}`,
  'EXPO_PUBLIC_APP_ENV=development',
  '',
].join('\n'));
console.log('[ci-stack] wrote .env and apps/mobile/.env');
