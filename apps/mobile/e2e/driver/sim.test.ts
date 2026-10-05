import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunResult } from './proc';
import { reboot, waitUntilLaunchable } from './sim';

const { run } = vi.hoisted(() => ({
  run: vi.fn<(cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<RunResult>>(),
}));
vi.mock('./proc', async (orig) => {
  const real = await orig<typeof import('./proc')>();
  // runOk must go through the fake too, or bootstatus would run for real.
  const runOk = async (cmd: string, args: string[], opts?: { timeoutMs?: number }) => {
    const r = await run(cmd, args, opts);
    if (r.code !== 0) throw new Error(real.describeFailure(cmd, args, r));
    return r.stdout;
  };
  return { ...real, run, runOk };
});

const ok = (): RunResult => ({ stdout: 'com.apple.Preferences: 4242\n', stderr: '', code: 0, timedOut: false, signal: null, timeoutMs: 20_000 });
/** What the hung launch on CI run 36713494350 looked like once our timeout killed it. */
const hung = (): RunResult => ({ stdout: '', stderr: '', code: 1, timedOut: true, signal: 'SIGTERM', timeoutMs: 20_000 });

/** Drive fake timers until the promise settles (every probe also awaits a 3 s pause). */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  p.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 1_000 && !done; i++) await vi.advanceTimersByTimeAsync(1_000);
  return p;
}

const launches = () => run.mock.calls.filter(([, args]) => args[1] === 'launch');
const terminates = () => run.mock.calls.filter(([, args]) => args[1] === 'terminate');
const shutdowns = () => run.mock.calls.filter(([, args]) => args[1] === 'shutdown');

describe('waitUntilLaunchable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    run.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('probes with Settings, not our app, and closes it again', async () => {
    run.mockResolvedValue(ok());
    await settle(waitUntilLaunchable());
    expect(launches()).toHaveLength(1);
    expect(launches()[0]?.[1]).toContain('com.apple.Preferences');
    expect(terminates()[0]?.[1]).toContain('com.apple.Preferences');
  });

  it('keeps probing on short attempts until a launch returns', async () => {
    run.mockImplementation(async (_cmd, args) => (args[1] === 'launch' && launches().length < 3 ? hung() : ok()));
    await settle(waitUntilLaunchable());
    expect(launches()).toHaveLength(3);
    for (const [, , opts] of launches()) expect(opts?.timeoutMs).toBeLessThanOrEqual(20_000);
  });

  it('gives up at its budget, saying what the last probe did', async () => {
    run.mockImplementation(async (_cmd, args) => (args[1] === 'launch' ? hung() : ok()));
    const started = Date.now();
    await expect(settle(waitUntilLaunchable(30_000))).rejects.toThrow(
      /could not launch apps within 30s of booting; last probe: .*com\.apple\.Preferences failed \(timed out after 20s and was killed\):\n\(nothing on stdout or stderr\)/s,
    );
    expect(Date.now() - started).toBeLessThan(30_000 + 20_000);
    expect(terminates()).toHaveLength(0);
  });
});

describe('reboot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    run.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('boots once when the device comes up launchable', async () => {
    run.mockResolvedValue(ok());
    await settle(reboot());
    expect(shutdowns()).toHaveLength(1);
    expect(run.mock.calls.some(([, args]) => args[1] === 'status_bar')).toBe(true);
  });

  it('boots a second time when the first boot never launches anything — run 36713494350', async () => {
    run.mockImplementation(async (_cmd, args) => (args[1] === 'launch' && shutdowns().length < 2 ? hung() : ok()));
    await settle(reboot());
    expect(shutdowns()).toHaveLength(2);
    expect(terminates()).toHaveLength(1); // the probe that finally worked, closed again
  });

  it('gives up after two boots, with the probe failure', async () => {
    run.mockImplementation(async (_cmd, args) => (args[1] === 'launch' ? hung() : ok()));
    await expect(settle(reboot())).rejects.toThrow(/could not launch apps within 60s of booting/);
    expect(shutdowns()).toHaveLength(2);
    expect(run.mock.calls.some(([, args]) => args[1] === 'status_bar')).toBe(false);
  });
});
