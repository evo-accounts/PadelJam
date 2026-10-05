import { existsSync } from 'node:fs';
import { resetAccessibilityWedge } from './a11y';
import { AccessibilityWedgedError, WEDGE_PERSIST_MS } from './axWedge';
import { CONFIG } from './config';
import { restartCompanion } from './idb';
import * as sim from './sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Path where the orchestrator leaves the built Release .app. */
export const APP_PATH = process.env.E2E_APP_PATH
  ?? `${__dirname}/../../.e2e-derived/Build/Products/Release-iphonesimulator/PadelJam.app`;

/** Waits before the 2nd and 3rd post-reboot launch attempts. */
export const POST_REBOOT_LAUNCH_BACKOFF_MS = [5_000, 15_000] as const;

/**
 * Launch our app. Normally one attempt: a launch failure on a settled device is
 * real news and must surface. Straight after a reboot, a generic failure is
 * retried with backoff, on shorter attempts — the device has just proved it can
 * launch Settings (sim.waitUntilLaunchable), but CI run 36713494350 showed a
 * freshly booted simulator is not yet trustworthy.
 */
async function launchApp(args: string[], afterReboot: boolean): Promise<void> {
  if (!afterReboot) return sim.launch({ args });
  for (let attempt = 0; ; attempt++) {
    try {
      return await sim.launch({ args, timeoutMs: 45_000 });
    } catch (e) {
      const wait = POST_REBOOT_LAUNCH_BACKOFF_MS[attempt];
      // Not-registered has its own escalation in relaunch; the budget is finite.
      if (e instanceof sim.AppNotRegisteredError || wait === undefined) throw e;
      console.warn(
        `[e2e] relaunch: launch failed right after a simulator reboot — retrying in ${wait / 1000}s `
          + `(${attempt + 1}/${POST_REBOOT_LAUNCH_BACKOFF_MS.length})\n${e instanceof Error ? e.message : String(e)}`,
      );
      await sleep(wait);
      await sim.terminate();
    }
  }
}

/**
 * Launch with deterministic English so text selectors are stable.
 *
 * After a fresh install SpringBoard sometimes never registers the bundle even
 * though the container exists (CI runner, roughly one suite in fifteen on
 * 2026-09-12/13; `launch`'s 30 s of retries is not enough). Escalate in two
 * steps: reinstall the .app (in place — data is kept), then reboot the device
 * and install again. Each step is logged so a run that needed it stands out.
 *
 * `afterReboot`: the caller just rebooted the simulator (see launchApp).
 */
export async function relaunch(opts: { extraArgs?: string[]; afterReboot?: boolean } = {}): Promise<void> {
  await sim.terminate();
  await sleep(1000);
  const args = ['-AppleLanguages', '("en")', '-AppleLocale', 'en_US', ...(opts.extraArgs ?? [])];
  try {
    await launchApp(args, opts.afterReboot ?? false);
  } catch (e) {
    if (!(e instanceof sim.AppNotRegisteredError)) throw e;
    console.warn('[e2e] relaunch: SpringBoard does not know the bundle — reinstalling the app');
    await sim.install(APP_PATH);
    try {
      await sim.launch({ args });
    } catch (e2) {
      if (!(e2 instanceof sim.AppNotRegisteredError)) throw e2;
      console.warn('[e2e] relaunch: still unknown after reinstall — rebooting the simulator');
      await sim.reboot();
      await sim.install(APP_PATH);
      await launchApp(args, true);
    }
  }
  await sleep(2000); // splash minimum is 600ms; give boot routing room
}

/**
 * Simulator reboots freshInstall may spend on a wedged accessibility tree (see
 * axWedge.ts). Module state, and vitest re-evaluates the driver for every suite
 * file (isolation is on even in our singleFork pool — checked 2026-09-30), so
 * this is a per-suite budget: one wedge plus one relapse. A simulator still
 * wedged after that fails the suite instead of rebooting forever.
 */
const MAX_WEDGE_REBOOTS = 2;
let wedgeReboots = 0;

/**
 * The only cure found for a wedged AX bridge (2026-09-30): a full simulator
 * reboot. Restarting idb_companion alone did not do it, and neither did a
 * reinstall. Safe here and only here: freshInstall is about to throw the app's
 * state away anyway, so the reboot cannot lose anything a test was relying on.
 */
async function rebootForWedgedAccessibility(): Promise<void> {
  wedgeReboots++;
  console.warn(
    `[e2e] freshInstall: accessibility tree wedged (describe-all empty for ${WEDGE_PERSIST_MS / 1000}s+ with the app `
      + `launched) — rebooting the simulator (${wedgeReboots}/${MAX_WEDGE_REBOOTS} this suite)`,
  );
  await sim.reboot(); // returns once the device can launch apps again
  await restartCompanion(); // it lost its simulator; respawn before the next describe-all
  resetAccessibilityWedge();
}

/** Uninstall + reinstall: clears AsyncStorage, SecureStore and keychain session. */
export async function freshInstall(): Promise<void> {
  if (!existsSync(APP_PATH)) {
    throw new Error(`Built app not found at ${APP_PATH} — run the orchestrator (pnpm --filter mobile e2e) or set E2E_APP_PATH.`);
  }
  // Purges count stale-session retries only; wedge reboots have their own
  // budget above, so the loop is bounded by 3 + MAX_WEDGE_REBOOTS passes.
  let afterReboot = false;
  for (let purges = 0; purges < 3;) {
    await sim.terminate();
    await sim.uninstall();
    await sim.keychainReset(); // SecureStore session survives uninstall otherwise
    await sim.install(APP_PATH);
    await relaunch({ afterReboot });
    afterReboot = false;
    // Verify the purge took: a truly fresh install boots to welcome (or sign-in).
    const { waitFor } = await import('./expect');
    const { landed, wedged } = await waitFor(
      // `^Get started$`, anchored: the phrase also ends a sentence of the community
      // empty state, so only the welcome button's exact label counts as welcome.
      { text: /^Get started$|Login or Sign Up|Complete your account|Home/ },
      { timeout: 30_000 },
    ).then(
      (el) => ({ landed: el, wedged: false }),
      (e: unknown) => ({ landed: null, wedged: e instanceof AccessibilityWedgedError }),
    );
    const label = landed?.AXLabel ?? '';
    if (/^get started$|login or sign up/i.test(label)) return;
    if (wedged) {
      // Before 2026-09-30 this read as `stale session … (saw "")` and burned
      // every purge; another purge cannot fix it, so do not spend one.
      if (wedgeReboots >= MAX_WEDGE_REBOOTS) {
        throw new AccessibilityWedgedError(
          `freshInstall: accessibility tree still wedged after ${MAX_WEDGE_REBOOTS} simulator reboots in this suite`,
        );
      }
      await rebootForWedgedAccessibility();
      afterReboot = true;
      continue;
    }
    purges++;
    console.warn(`[e2e] freshInstall: stale session survived keychain reset (saw "${label}") — retrying purge`);
  }
  throw new Error('freshInstall: could not reach a signed-out state after 3 keychain purges');
}

export { CONFIG };
