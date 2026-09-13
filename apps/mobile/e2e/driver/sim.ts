import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CONFIG } from './config';
import { run, runOk } from './proc';

const simctl = (args: string[], timeoutMs?: number) => runOk('xcrun', ['simctl', ...args], { timeoutMs });

export async function boot(): Promise<void> {
  const r = await run('xcrun', ['simctl', 'boot', CONFIG.udid]);
  // "Unable to boot device in current state: Booted" is fine.
  if (r.code !== 0 && !/current state: Booted/.test(r.stderr)) {
    throw new Error(`simctl boot failed: ${r.stderr}`);
  }
  await simctl(['bootstatus', CONFIG.udid, '-b'], 120_000);
}

export async function install(appPath: string): Promise<void> {
  await simctl(['install', CONFIG.udid, appPath], 300_000);
  // `simctl install` returns before SpringBoard has registered the bundle on a
  // busy device; launching in that window fails with "Unknown application
  // display identifier". Wait until the container is queryable (CI: up to 60 s).
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const r = await run('xcrun', ['simctl', 'get_app_container', CONFIG.udid, CONFIG.bundleId], { timeoutMs: 20_000 });
    if (r.code === 0) return;
    await new Promise((res) => setTimeout(res, 2_000));
  }
  throw new Error(`simctl install: ${CONFIG.bundleId} never became queryable on ${CONFIG.udid}`);
}
export const uninstall = () => simctl(['uninstall', CONFIG.udid, CONFIG.bundleId], 120_000);

/**
 * Wipe the simulator keychain. SecureStore (and thus the Supabase session)
 * SURVIVES app uninstall — a fresh-install state requires this too.
 */
export const keychainReset = () => simctl(['keychain', CONFIG.udid, 'reset'], 60_000);

/** Device is up: `simctl shutdown` succeeded or the device was already shut down. */
export async function shutdown(): Promise<void> {
  const r = await run('xcrun', ['simctl', 'shutdown', CONFIG.udid], { timeoutMs: 120_000 });
  if (r.code !== 0 && !/current state: Shutdown/.test(r.stderr)) {
    throw new Error(`simctl shutdown failed: ${r.stderr}`);
  }
}

/**
 * SpringBoard kept answering "Unknown application display identifier" for the
 * bundle after the brief retry window, although `get_app_container` says it is
 * installed. Callers that own the .app path can recover by reinstalling or
 * rebooting the device (see `relaunch` in app.ts).
 */
export class AppNotRegisteredError extends Error {}

export async function launch(opts: { args?: string[]; env?: Record<string, string> } = {}): Promise<void> {
  const envArgs: string[] = [];
  // simctl launch passes env vars prefixed with SIMCTL_CHILD_.
  const env = Object.fromEntries(Object.entries(opts.env ?? {}).map(([k, v]) => [`SIMCTL_CHILD_${k}`, v]));
  Object.assign(process.env, env);
  try {
    // Right after `simctl install`, SpringBoard can still answer "Unknown
    // application display identifier" for a second or two (seen on the CI
    // runner in three runs on 2026-09-12). Retry that one error briefly.
    for (let attempt = 0; ; attempt++) {
      const r = await run('xcrun', ['simctl', 'launch', CONFIG.udid, CONFIG.bundleId, ...(opts.args ?? [])], { timeoutMs: 120_000 });
      if (r.code === 0) break;
      const out = `${r.stderr}${r.stdout}`;
      const notRegistered = /Unknown application display identifier|NotFound/.test(out);
      if (attempt < 10 && notRegistered) {
        await new Promise((res) => setTimeout(res, 3_000));
        continue;
      }
      const message = `xcrun simctl launch ${CONFIG.udid} ${CONFIG.bundleId} ${(opts.args ?? []).join(' ')} failed (${r.code}):\n${out}`;
      throw notRegistered ? new AppNotRegisteredError(message) : new Error(message);
    }
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
  }
  void envArgs;
}

export async function terminate(): Promise<void> {
  await run('xcrun', ['simctl', 'terminate', CONFIG.udid, CONFIG.bundleId]); // ok if not running
}

/**
 * Open a URL on the device.
 *
 * `simctl openurl` is unreliable on long-running simulators: SpringBoard's
 * launch-services can degrade until every call blocks for ~10s and returns
 * NSPOSIXErrorDomain 60 (sometimes killing the foreground app). Callers should
 * treat OpenUrlUnavailableError as an environment limitation, not a test failure.
 */
export class OpenUrlUnavailableError extends Error {}

export async function openUrl(url: string): Promise<void> {
  const r = await run('xcrun', ['simctl', 'openurl', CONFIG.udid, url], { timeoutMs: 20_000 });
  if (r.code === 0) return;
  if (/timed out|NSPOSIXErrorDomain, code=60/.test(`${r.stderr}${r.stdout}`)) {
    throw new OpenUrlUnavailableError(`simctl openurl is unresponsive on this simulator (${url}). Reboot the device to recover.`);
  }
  throw new Error(`simctl openurl failed: ${r.stderr || r.stdout}`);
}

/** Grant/revoke/reset a privacy service (location, photos, camera, …). */
export const privacy = (action: 'grant' | 'revoke' | 'reset', service: string) =>
  simctl(['privacy', CONFIG.udid, action, service, CONFIG.bundleId]);

/** Inject an APNs payload; payload must include a "Simulator Target Bundle" key or we add it. */
export async function push(payload: Record<string, unknown>): Promise<void> {
  const body = { 'Simulator Target Bundle': CONFIG.bundleId, ...payload };
  const file = join(tmpdir(), `e2e-push-${Date.now()}.apns`);
  writeFileSync(file, JSON.stringify(body));
  await simctl(['push', CONFIG.udid, CONFIG.bundleId, file]);
}

export async function screenshot(outPath: string): Promise<string> {
  mkdirSync(join(outPath, '..'), { recursive: true });
  await simctl(['io', CONFIG.udid, 'screenshot', outPath]);
  return outPath;
}

/** Tail of the app's recent os_log output — attached to failure artifacts. */
export async function appLogTail(seconds = 30): Promise<string> {
  const r = await run('xcrun', [
    'simctl', 'spawn', CONFIG.udid, 'log', 'show', '--last', `${seconds}s`, '--style', 'compact',
    '--predicate', 'process == "PadelJam"',
  ], { timeoutMs: 60_000 });
  return r.stdout.slice(-20_000);
}

/** Stable status bar for screenshots. */
export async function overrideStatusBar(): Promise<void> {
  await run('xcrun', ['simctl', 'status_bar', CONFIG.udid, 'override', '--time', '9:41', '--batteryLevel', '100', '--batteryState', 'charged']);
}
