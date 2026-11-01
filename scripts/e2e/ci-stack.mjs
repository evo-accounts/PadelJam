#!/usr/bin/env node
/**
 * Brings the e2e Supabase stack up and writes the two .env files the run reads.
 *
 *   node scripts/e2e/ci-stack.mjs [--stack ci|dev]     (default: ci)
 *
 * The workflow step runs exactly this, so changes here need no workflow edit. It never runs `stop`.
 * To remove the CI stack by hand, with the CI env set (never a bare `supabase stop`: it takes down
 * whichever stack the directory's config.toml names, i.e. the agents' one):
 *   pnpm dlx supabase@2.117.0 --workdir infra stop --project-id padeljam_ci --no-backup
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStack } from './stack.mjs';

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

const supabase = (...cmd) => execFileSync(
  'pnpm',
  ['dlx', `supabase@${SUPABASE_CLI_VERSION}`, '--workdir', join(ROOT, 'infra'), ...cmd],
  { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', cmd[0] === 'start' ? 'inherit' : 'pipe', 'inherit'] },
);

console.log(`[ci-stack] stack: ${stack.name} (${stack.projectId}, ${stack.apiUrl})`);
supabase('start');
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
