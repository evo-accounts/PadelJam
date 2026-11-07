import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG } from './config';
import { describeFailure, run } from './proc';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 90 s: #332 needed 55 s under load. A 30 s hang plus this stays inside the 180 s testTimeout. */
export const COMPANION_START_MS = 90_000;
/** idb's stderr when the AX bridge has no translation for the device (see axWedge.ts). */
const NO_TRANSLATION = /No translation object returned/i;
export const NO_TRANSLATION_RETRY_MS = 3_000;

/**
 * idb talks to a per-device `idb_companion` over a unix socket. The companion
 * dies with the simulator (or when CoreSimulator restarts), leaving every call
 * failing with "Connection lost"/"Connection refused". Respawn it on the socket
 * path the client expects, then retry once. Exported for the wedged-AX reboot
 * in app.ts, which knows the companion just lost its simulator.
 *
 * Waits for the socket to appear rather than a fixed 6 s: on a sluggish CoreSimulator the new
 * companion took longer than that, and the retry then failed with "[Errno 2] No such file or
 * directory" on the socket (PR 296). The old socket is removed first so its presence means the
 * new companion is listening, and the companion's output goes to a log so a start that never
 * comes up says why.
 */
export async function restartCompanion(): Promise<void> {
  const sock = `/tmp/idb/${CONFIG.udid}_companion.sock`;
  const log = join(tmpdir(), `idb_companion_${CONFIG.udid}.log`);
  await run('pkill', ['-f', `idb_companion.*${CONFIG.udid}`]);
  await sleep(1500);
  rmSync(sock, { force: true });
  const out = openSync(log, 'w');
  const child = spawn('idb_companion', ['--udid', CONFIG.udid, '--grpc-domain-sock', sock], {
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  closeSync(out);
  const deadline = Date.now() + COMPANION_START_MS;
  while (!existsSync(sock) && Date.now() < deadline) await sleep(500);
  if (!existsSync(sock)) {
    const tail = readFileSync(log, 'utf8').trim().split('\n').slice(-5).join('\n');
    console.warn(`[e2e] idb companion did not open ${sock} within ${COMPANION_START_MS / 1000}s:\n${tail || '(no output)'}`);
    return;
  }
  await sleep(1000); // the socket exists slightly before the companion accepts on it
}

/**
 * Thin wrapper over the fb-idb CLI, always scoped to the configured UDID.
 * `retryOnHang` also restarts the companion when the call hangs with no output, which is how a
 * stuck companion looks from here (PR 296: one 30 s describe-all hang failed a whole run that
 * otherwise passed 138/139). Only for calls that are safe to repeat — a tap or typed text that
 * timed out may still have landed.
 */
export async function idb(args: string[], timeoutMs = 30_000, opts: { retryOnHang?: boolean } = {}): Promise<string> {
  const argv = [...args, '--udid', CONFIG.udid];
  const first = await run(CONFIG.idbPath, argv, { timeoutMs });
  if (first.code === 0) return first.stdout;
  let last = first;
  const errOf = (r: typeof first) => `${r.stderr}${r.stdout}`;
  const unreachable = /Connection lost|Connection refused|No Companion Connected|Failed to connect to companion/i.test(errOf(first));
  const hung = Boolean(opts.retryOnHang) && first.timedOut && !errOf(first).trim();
  if (unreachable || hung) {
    console.warn(`[e2e] idb companion ${hung ? 'hung' : 'unreachable'} — restarting it`);
    await restartCompanion();
    last = await run(CONFIG.idbPath, argv, { timeoutMs });
    if (last.code === 0) return last.stdout;
  }
  // A read that may be repeated gets one more try on a transient "No translation object", also
  // when it comes back from the retry after a restart. Bounded polling reads are left alone.
  if (opts.retryOnHang && NO_TRANSLATION.test(errOf(last))) {
    await sleep(NO_TRANSLATION_RETRY_MS);
    last = await run(CONFIG.idbPath, argv, { timeoutMs });
    if (last.code === 0) return last.stdout;
  }
  throw new Error(describeFailure(CONFIG.idbPath, argv, last));
}

export const idbTap = (x: number, y: number, durationSec?: number) =>
  idb([
    'ui', 'tap', String(Math.round(x)), String(Math.round(y)),
    ...(durationSec ? ['--duration', String(durationSec)] : []),
  ]);
export const idbText = (text: string) => idb(['ui', 'text', text]);
/** HID key codes: 40 = return, 42 = backspace/delete. */
export const idbKey = (code: number) => idb(['ui', 'key', String(code)]);
export const idbSwipe = (x1: number, y1: number, x2: number, y2: number, durationMs = 300) =>
  idb(['ui', 'swipe', String(x1), String(y1), String(x2), String(y2), '--duration', String(durationMs / 1000)]);
/**
 * Read-only, so a hang is retried — but only for the default 30 s read. A caller that passes its
 * own bound is a wait polling against a deadline (expect.ts `readTimeout`); it polls again by
 * itself, and a 7.5 s companion restart inside it would eat that budget.
 */
export const idbDescribeAll = (timeoutMs?: number) =>
  idb(['ui', 'describe-all', '--json'], timeoutMs ?? 30_000, { retryOnHang: timeoutMs == null });
