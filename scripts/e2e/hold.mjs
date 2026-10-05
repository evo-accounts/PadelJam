#!/usr/bin/env node
/**
 * Hold the E2E shared-stack lock while you work against the local stack by hand.
 *
 *   pnpm e2e:hold              # until Ctrl-C (capped at 60 minutes)
 *   pnpm e2e:hold -- 20        # for 20 minutes
 *
 * The simulator, the local Supabase and Mailpit are ONE shared stack. A browser session signing in
 * through Mailpit, or a simulator walk-through, while a CI run is going makes BOTH wrong: the run
 * reads the wrong one-time code or types into a screen someone else is using (2026-09-25: suite 01
 * failed seven OTP tests while a web session was signing in). This takes the same lock run.mjs
 * takes, so a queued run waits for you instead of colliding, and you wait for a run in progress.
 * run.mjs recognises this script as a live holder by its name.
 */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const LOCK = '/tmp/padeljam-e2e.lock';
// `pnpm e2e:hold -- 20` hands the script a literal `--` before the number, so take the first
// argument that isn't one. Anything that isn't a positive number is an error, not a silent 60.
const arg = process.argv.slice(2).find((a) => a !== '--');
if (arg !== undefined && !(Number(arg) > 0)) {
  console.error(`[e2e:hold] expected a number of minutes, got "${arg}" — usage: pnpm e2e:hold -- 20`);
  process.exit(2);
}
const minutes = Math.min(arg === undefined ? 60 : Number(arg), 180);

function holder() {
  let info;
  try { info = JSON.parse(readFileSync(LOCK, 'utf8')); } catch { return null; }
  try { process.kill(info.pid, 0); } catch { return null; }
  const cmd = spawnSync('ps', ['-p', String(info.pid), '-o', 'command='], { encoding: 'utf8' }).stdout ?? '';
  return /(run|hold)\.mjs/.test(cmd) ? info : null;
}

for (;;) {
  try {
    writeFileSync(LOCK, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), cwd: process.cwd(), suite: 'manual (e2e:hold)' }), { flag: 'wx' });
    break;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  const h = holder();
  if (!h) { try { unlinkSync(LOCK); } catch { /* raced */ } continue; }
  console.log(`[e2e:hold] waiting for the stack — held by pid ${h.pid} (${h.suite ?? 'all suites'}) since ${h.startedAt}`);
  spawnSync('sleep', ['15']);
}

const release = () => {
  try { if (JSON.parse(readFileSync(LOCK, 'utf8')).pid === process.pid) unlinkSync(LOCK); } catch { /* gone */ }
};
process.on('exit', release);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));

console.log(`[e2e:hold] holding the simulator + local Supabase + Mailpit for ${minutes} min — Ctrl-C to release.`);
setTimeout(() => {
  console.log('[e2e:hold] time is up — releasing.');
  process.exit(0);
}, minutes * 60_000);
