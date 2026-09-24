#!/usr/bin/env node
/**
 * Run every `infra/supabase/tests/*.test.mjs` against a local Supabase, and report ALL of them.
 *
 * This replaces a shell loop, `for f in …; do node "$f" || exit 1; done`, which stopped at the first
 * red file. That is fine at a desk and wrong for a gate: one failure hid the other eleven, so a CI
 * run could only ever tell you about one problem at a time. Here every file runs, the summary
 * names each outcome, and the exit code is non-zero if any failed.
 *
 * Three properties of the old loop are kept on purpose, because the files depend on them:
 *
 *   ONE PROCESS PER FILE. `lib.mjs` makes test emails unique with `TEST_RUN || Date.now()`, and
 *   separate files reuse the same tags — `mixed-start` and `notifications` both create
 *   `user('org')`. A fresh process per file means a fresh `Date.now()`, so they never meet. Running
 *   them in one process, or exporting one `TEST_RUN` for all of them, collides the second on a
 *   duplicate email. If `TEST_RUN` IS set, each file gets it with its own suffix for the same reason.
 *
 *   SEQUENTIAL. `auth-methods.test.mjs` truncates the shared `auth_lookup_attempts` ledger. Harmless
 *   one file at a time; a race with anything parallel.
 *
 *   ALPHABETICAL, so a run is reproducible and a failure can be replayed with `node <file>`.
 *
 * Known fragility, written down rather than changed blind: `internal-rpc-privileges.test.mjs`
 * looks for its own event inside `explore_events(p_limit: 50)`, ordered by `starts_at`. On a scratch
 * stack that is safe. On a long-lived local database, enough accumulated public future events can
 * push it out of the window — so a failure there on a developer's machine is worth a `db reset`
 * before it is worth a fix.
 *
 * Needs a running local stack and SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY,
 * from the environment or a repo-root `.env`; `lib.mjs` refuses any non-local URL.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'infra', 'supabase', 'tests');

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort();

if (files.length === 0) {
  console.error(`[test:db] no *.test.mjs files in ${relative(ROOT, DIR)}`);
  process.exit(1);
}

const results = [];
for (const [i, file] of files.entries()) {
  const env = { ...process.env };
  if (env.TEST_RUN) env.TEST_RUN = `${env.TEST_RUN}-${i}`;

  console.log(`\n━━ ${file}`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [join(DIR, file)], { cwd: ROOT, env, stdio: 'inherit' });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  // A null status means the process was killed by a signal, which is a failure too.
  results.push({ file, ok: r.status === 0, seconds, status: r.status ?? r.signal });
}

const failed = results.filter((r) => !r.ok);
console.log('\n━━ test:db summary');
for (const r of results) {
  console.log(`  ${r.ok ? '✔' : '✘'} ${r.file}  (${r.seconds}s${r.ok ? '' : `, exit ${r.status}`})`);
}
console.log(`\n${results.length - failed.length}/${results.length} files passed`);
process.exit(failed.length ? 1 : 0);
