import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * freshInstall's wedge recovery and the post-reboot launch, driven against a
 * fake simulator. The real thing only happens ~80 minutes into a full E2E run,
 * so this is the only place its control flow is exercised on purpose.
 */

type Tree = 'healthy' | 'wedged' | 'noTranslation';

const h = vi.hoisted(() => ({
  calls: [] as string[],
  tree: 'healthy' as Tree,
  /** The tree heals on this reboot (1-based); Infinity = never. */
  healOnReboot: 1,
  reboots: 0,
  /** Launch outcomes to hand out in order; empty = succeed. */
  launchFailures: [] as ('hang' | 'notRegistered')[],
  /** Moved into launchFailures by the next reboot. */
  launchFailuresAfterReboot: [] as ('hang' | 'notRegistered')[],
  launchTimeouts: [] as (number | undefined)[],
}));

vi.mock('node:fs', async (orig) => ({
  ...(await orig<typeof import('node:fs')>()),
  existsSync: () => true,
  mkdirSync: () => undefined,
  writeFileSync: () => undefined,
}));

vi.mock('./sim', () => {
  class AppNotRegisteredError extends Error {}
  const rec = (name: string) => async () => { h.calls.push(name); };
  return {
    AppNotRegisteredError,
    terminate: rec('terminate'),
    uninstall: rec('uninstall'),
    keychainReset: rec('keychainReset'),
    install: rec('install'),
    overrideStatusBar: rec('overrideStatusBar'),
    reboot: async () => {
      h.calls.push('reboot');
      h.reboots++;
      if (h.reboots >= h.healOnReboot) h.tree = 'healthy';
      h.launchFailures.push(...h.launchFailuresAfterReboot.splice(0));
    },
    launch: async (opts: { timeoutMs?: number } = {}) => {
      h.calls.push('launch');
      h.launchTimeouts.push(opts.timeoutMs);
      const outcome = h.launchFailures.shift();
      if (outcome === 'hang') throw new Error('xcrun simctl launch … failed (timed out after 45s and was killed):\n(nothing on stdout or stderr)');
      if (outcome === 'notRegistered') throw new AppNotRegisteredError('Unknown application display identifier');
    },
    screenshot: async () => '',
    appLogTail: async () => '',
  };
});

vi.mock('./idb', () => ({
  restartCompanion: async () => { h.calls.push('restartCompanion'); },
  idbDescribeAll: async () => {
    if (h.tree === 'noTranslation') throw new Error('idb ui describe-all failed (exit 1):\nstderr: No translation object returned for simulator.');
    const app = (width: number, height: number) => ({ type: 'Application', role: 'AXApplication', AXLabel: 'PadelJam', frame: { x: 0, y: 0, width, height } });
    if (h.tree === 'wedged') return JSON.stringify([app(0, 0)]);
    return JSON.stringify([app(402, 874), { type: 'Button', role: 'AXButton', AXLabel: 'Start now', frame: { x: 16, y: 700, width: 370, height: 52 } }]);
  },
}));

/** Run a driver call to completion under fake timers (every wait in it is a setTimeout). */
async function drive<T>(p: Promise<T>): Promise<T> {
  let done = false;
  p.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 10_000 && !done; i++) await vi.advanceTimersByTimeAsync(500);
  return p;
}

const count = (name: string) => h.calls.filter((c) => c === name).length;

beforeEach(() => {
  vi.useFakeTimers();
  // freshInstall's reboot budget is module state: a fresh module per test.
  vi.resetModules();
  Object.assign(h, {
    calls: [], tree: 'healthy', healOnReboot: 1, reboots: 0, launchFailures: [], launchFailuresAfterReboot: [], launchTimeouts: [],
  });
  vi.spyOn(console, 'warn').mockImplementation((msg: unknown) => { h.calls.push(`WARN ${String(msg)}`); });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('freshInstall', () => {
  it('does not reboot a healthy simulator', async () => {
    const { freshInstall } = await import('./app');
    await drive(freshInstall());
    expect(count('reboot')).toBe(0);
    expect(count('launch')).toBe(1);
  });

  it.each<Tree>(['wedged', 'noTranslation'])('reboots once for a %s tree, then lands', async (tree) => {
    h.tree = tree;
    const { freshInstall } = await import('./app');
    await drive(freshInstall());
    expect(count('reboot')).toBe(1);
    expect(h.calls.indexOf('restartCompanion')).toBeGreaterThan(h.calls.indexOf('reboot'));
    expect(h.calls.some((c) => c.includes('stale session'))).toBe(false); // a wedge spends no purge
  });

  it('gives up after two reboots in one suite, and does not reboot again after that', async () => {
    h.tree = 'wedged';
    h.healOnReboot = Infinity;
    const { freshInstall } = await import('./app');
    const { AccessibilityWedgedError } = await import('./axWedge');
    await expect(drive(freshInstall())).rejects.toBeInstanceOf(AccessibilityWedgedError);
    expect(count('reboot')).toBe(2);
    h.calls.length = 0;
    await expect(drive(freshInstall())).rejects.toThrow(/still wedged after 2 simulator reboots/);
    expect(count('reboot')).toBe(0);
  });
});

describe('the launch after a reboot', () => {
  it('retries a generic launch failure with backoff — run 36713494350', async () => {
    h.tree = 'wedged';
    h.launchFailuresAfterReboot = ['hang'];
    const { freshInstall } = await import('./app');
    await drive(freshInstall());
    expect(count('launch')).toBe(3); // before the reboot, the hang, the retry
    expect(h.launchTimeouts).toEqual([undefined, 45_000, 45_000]);
    expect(h.calls.some((c) => c.includes('launch failed right after a simulator reboot — retrying in 5s (1/2)'))).toBe(true);
  });

  it('stops after three attempts and surfaces the launch error', async () => {
    const { relaunch } = await import('./app');
    h.launchFailures = ['hang', 'hang', 'hang', 'hang'];
    await expect(drive(relaunch({ afterReboot: true }))).rejects.toThrow(/timed out after 45s and was killed/);
    expect(count('launch')).toBe(3);
  });

  it('leaves a normal launch alone: one attempt, default timeout, failure surfaces', async () => {
    const { relaunch } = await import('./app');
    h.launchFailures = ['hang'];
    await expect(drive(relaunch())).rejects.toThrow(/failed/);
    expect(count('launch')).toBe(1);
    expect(h.launchTimeouts).toEqual([undefined]);
  });

  it('hands not-registered to the existing reinstall escalation instead of retrying it', async () => {
    const { relaunch } = await import('./app');
    h.launchFailures = ['notRegistered'];
    await drive(relaunch({ afterReboot: true }));
    expect(h.calls.filter((c) => c === 'install' || c === 'launch')).toEqual(['launch', 'install', 'launch']);
  });
});

describe('waitFor / expectGone on a wedged tree', () => {
  it('waitFor: a plain timeout while the wedge is young, AccessibilityWedgedError once it has persisted', async () => {
    h.tree = 'wedged';
    const { waitFor } = await import('./expect');
    const { AccessibilityWedgedError } = await import('./axWedge');
    await expect(drive(waitFor({ text: 'x' }, { timeout: 5_000 }))).rejects.not.toBeInstanceOf(AccessibilityWedgedError);
    await expect(drive(waitFor({ text: 'x' }, { timeout: 15_000 }))).rejects.toBeInstanceOf(AccessibilityWedgedError);
  });

  it('expectGone never passes on a wedged (empty) read', async () => {
    h.tree = 'wedged';
    const { expectGone } = await import('./expect');
    await expect(drive(expectGone({ text: 'Start now' }, { timeout: 12_000 }))).rejects.toThrow(/accessibility tree wedged/);
  });
});
