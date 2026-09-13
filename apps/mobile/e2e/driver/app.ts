import { existsSync } from 'node:fs';
import { CONFIG } from './config';
import * as sim from './sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Path where the orchestrator leaves the built Release .app. */
export const APP_PATH = process.env.E2E_APP_PATH
  ?? `${__dirname}/../../.e2e-derived/Build/Products/Release-iphonesimulator/PadelJam.app`;

/**
 * Launch with deterministic English so text selectors are stable.
 *
 * After a fresh install SpringBoard sometimes never registers the bundle even
 * though the container exists (CI runner, roughly one suite in fifteen on
 * 2026-09-12/13; `launch`'s 30 s of retries is not enough). Escalate in two
 * steps: reinstall the .app (in place — data is kept), then reboot the device
 * and install again. Each step is logged so a run that needed it stands out.
 */
export async function relaunch(opts: { extraArgs?: string[] } = {}): Promise<void> {
  await sim.terminate();
  await sleep(1000);
  const args = ['-AppleLanguages', '("en")', '-AppleLocale', 'en_US', ...(opts.extraArgs ?? [])];
  try {
    await sim.launch({ args });
  } catch (e) {
    if (!(e instanceof sim.AppNotRegisteredError)) throw e;
    console.warn('[e2e] relaunch: SpringBoard does not know the bundle — reinstalling the app');
    await sim.install(APP_PATH);
    try {
      await sim.launch({ args });
    } catch (e2) {
      if (!(e2 instanceof sim.AppNotRegisteredError)) throw e2;
      console.warn('[e2e] relaunch: still unknown after reinstall — rebooting the simulator');
      await sim.shutdown();
      await sim.boot();
      await sim.install(APP_PATH);
      await sim.launch({ args });
    }
  }
  await sleep(2000); // splash minimum is 600ms; give boot routing room
}

/** Uninstall + reinstall: clears AsyncStorage, SecureStore and keychain session. */
export async function freshInstall(): Promise<void> {
  if (!existsSync(APP_PATH)) {
    throw new Error(`Built app not found at ${APP_PATH} — run the orchestrator (pnpm --filter mobile e2e) or set E2E_APP_PATH.`);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    await sim.terminate();
    await sim.uninstall();
    await sim.keychainReset(); // SecureStore session survives uninstall otherwise
    await sim.install(APP_PATH);
    await relaunch();
    // Verify the purge took: a truly fresh install boots to welcome (or sign-in).
    const { waitFor } = await import('./expect');
    const landed = await waitFor(
      { text: /Start now|Login or Sign Up|Complete your account|Home/ },
      { timeout: 30_000 },
    ).catch(() => null);
    const label = landed?.AXLabel ?? '';
    if (/start now|login or sign up/i.test(label)) return;
    console.warn(`[e2e] freshInstall: stale session survived keychain reset (saw "${label}") — retrying purge`);
  }
  throw new Error('freshInstall: could not reach a signed-out state after 3 keychain purges');
}

export { CONFIG };
