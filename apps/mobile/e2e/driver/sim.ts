import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CONFIG } from './config';
import { describeFailure, run, runOk, type RunResult } from './proc';

const simctl = (args: string[], timeoutMs?: number) => runOk('xcrun', ['simctl', ...args], { timeoutMs });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function boot(): Promise<void> {
  const r = await run('xcrun', ['simctl', 'boot', CONFIG.udid]);
  // "Unable to boot device in current state: Booted" is fine.
  if (r.code !== 0 && !/current state: Booted/.test(r.stderr)) {
    throw new Error(describeFailure('xcrun', ['simctl', 'boot', CONFIG.udid], r));
  }
  await simctl(['bootstatus', CONFIG.udid, '-b'], 120_000);
}

/** Settings: on every simulator runtime, and launching it proves nothing about our app. */
const PROBE_BUNDLE = 'com.apple.Preferences';

/**
 * Wait until the device can actually launch an app.
 *
 * `bootstatus -b` returning does not mean that. After the wedged-AX reboot on
 * CI run 36713494350 (2026-09-30) it returned in 9 s, and the very next
 * `simctl launch` of our app hung until our 120 s timeout killed it — the host
 * log shows the launch going silent one second in. Probe with a system app on
 * short attempts instead, then close it again. A healthy boot passes the first
 * probe within about two seconds (measured by hand the same day).
 */
export async function waitUntilLaunchable(budgetMs = 60_000): Promise<void> {
  const argv = ['simctl', 'launch', CONFIG.udid, PROBE_BUNDLE];
  const deadline = Date.now() + budgetMs;
  let last: RunResult | undefined;
  while (Date.now() < deadline) {
    last = await run('xcrun', argv, { timeoutMs: Math.max(1_000, Math.min(20_000, deadline - Date.now())) });
    if (last.code === 0) {
      await run('xcrun', ['simctl', 'terminate', CONFIG.udid, PROBE_BUNDLE]);
      return;
    }
    await sleep(3_000);
  }
  throw new Error(
    `simulator could not launch apps within ${budgetMs / 1000}s of booting; last probe: `
      + (last ? describeFailure('xcrun', argv, last) : 'none ran'),
  );
}

/**
 * Full reboot, ending only once apps launch again. The status bar override
 * run.mjs set does not survive the shutdown, so it is restored here.
 *
 * Boots a second time if the first does not come up launchable. The device run
 * 36713494350 rebooted into could not finish ANY `simctl launch` — ours,
 * Safari, Settings: the process spawned and simctl never returned — and was
 * still like that 13 minutes later, when one more shutdown/boot fixed it at
 * once. Replaying the same sequence by hand never reproduced the hang, so this
 * is a bounded second chance, not a diagnosis.
 */
export async function reboot(): Promise<void> {
  for (let boots = 1; ; boots++) {
    await shutdown();
    await boot();
    try {
      await waitUntilLaunchable();
      break;
    } catch (e) {
      if (boots >= 2) throw e;
      console.warn(`[e2e] reboot: ${e instanceof Error ? e.message : String(e)} — shutting down and booting once more`);
    }
  }
  await overrideStatusBar();
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
    throw new Error(describeFailure('xcrun', ['simctl', 'shutdown', CONFIG.udid], r));
  }
}

/**
 * SpringBoard kept answering "Unknown application display identifier" for the
 * bundle after the brief retry window, although `get_app_container` says it is
 * installed. Callers that own the .app path can recover by reinstalling or
 * rebooting the device (see `relaunch` in app.ts).
 */
export class AppNotRegisteredError extends Error {}

export async function launch(
  opts: { args?: string[]; env?: Record<string, string>; timeoutMs?: number } = {},
): Promise<void> {
  const envArgs: string[] = [];
  // simctl launch passes env vars prefixed with SIMCTL_CHILD_.
  const env = Object.fromEntries(Object.entries(opts.env ?? {}).map(([k, v]) => [`SIMCTL_CHILD_${k}`, v]));
  Object.assign(process.env, env);
  try {
    // Right after `simctl install`, SpringBoard can still answer "Unknown
    // application display identifier" for a second or two (seen on the CI
    // runner in three runs on 2026-09-12). Retry that one error briefly.
    const argv = ['simctl', 'launch', CONFIG.udid, CONFIG.bundleId, ...(opts.args ?? [])];
    for (let attempt = 0; ; attempt++) {
      const r = await run('xcrun', argv, { timeoutMs: opts.timeoutMs ?? 120_000 });
      if (r.code === 0) break;
      const out = `${r.stderr}${r.stdout}`;
      const notRegistered = /Unknown application display identifier|NotFound/.test(out);
      if (attempt < 10 && notRegistered) {
        await sleep(3_000);
        continue;
      }
      const message = describeFailure('xcrun', argv, r);
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
