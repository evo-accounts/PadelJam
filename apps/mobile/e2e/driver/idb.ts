import { spawn } from 'node:child_process';
import { CONFIG } from './config';
import { run, runOk } from './proc';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * idb talks to a per-device `idb_companion` over a unix socket. The companion
 * dies with the simulator (or when CoreSimulator restarts), leaving every call
 * failing with "Connection lost"/"Connection refused". Respawn it on the socket
 * path the client expects, then retry once. Exported for the wedged-AX reboot
 * in app.ts, which knows the companion just lost its simulator.
 */
export async function restartCompanion(): Promise<void> {
  const sock = `/tmp/idb/${CONFIG.udid}_companion.sock`;
  await run('pkill', ['-f', `idb_companion.*${CONFIG.udid}`]);
  await sleep(1500);
  const child = spawn('idb_companion', ['--udid', CONFIG.udid, '--grpc-domain-sock', sock], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  await sleep(6000);
}

/** Thin wrapper over the fb-idb CLI, always scoped to the configured UDID. */
export async function idb(args: string[], timeoutMs = 30_000): Promise<string> {
  const argv = [...args, '--udid', CONFIG.udid];
  const first = await run(CONFIG.idbPath, argv, { timeoutMs });
  if (first.code === 0) return first.stdout;
  const err = `${first.stderr}${first.stdout}`;
  if (!/Connection lost|Connection refused|No Companion Connected|Failed to connect to companion/i.test(err)) {
    throw new Error(`${CONFIG.idbPath} ${argv.join(' ')} failed (${first.code}):\n${err}`);
  }
  console.warn('[e2e] idb companion unreachable — restarting it');
  await restartCompanion();
  return runOk(CONFIG.idbPath, argv, { timeoutMs });
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
export const idbDescribeAll = () => idb(['ui', 'describe-all', '--json'], 30_000);
