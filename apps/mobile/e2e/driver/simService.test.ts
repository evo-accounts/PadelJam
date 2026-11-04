import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunResult } from './proc';

const { run, restartCompanion } = vi.hoisted(() => ({
  run: vi.fn<(cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<RunResult>>(),
  restartCompanion: vi.fn(async () => {}),
}));
vi.mock('./proc', async (orig) => {
  const real = await orig<typeof import('./proc')>();
  const runOk = async (cmd: string, args: string[], opts?: { timeoutMs?: number }) => {
    const r = await run(cmd, args, opts);
    if (r.code !== 0) throw new Error(real.describeFailure(cmd, args, r));
    return r.stdout;
  };
  return { ...real, run, runOk };
});
vi.mock('./idb', () => ({ restartCompanion }));

const ok = (): RunResult => ({ stdout: '', stderr: '', code: 0, timedOut: false, signal: null, timeoutMs: 120_000 });
/** What `simctl uninstall` looked like on PR 296's stuck runner once our timeout killed it. */
const hung = (): RunResult => ({ stdout: '', stderr: '', code: 1, timedOut: true, signal: 'SIGTERM', timeoutMs: 120_000 });
const failed = (): RunResult => ({ stdout: '', stderr: 'No devices are booted.', code: 149, timedOut: false, signal: null, timeoutMs: 120_000 });

async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  p.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 1_000 && !done; i++) await vi.advanceTimersByTimeAsync(1_000);
  return p;
}

const kills = () => run.mock.calls.filter(([cmd]) => cmd === 'killall');
const calls = (sub: string) => run.mock.calls.filter(([cmd, args]) => cmd === 'xcrun' && args[1] === sub);

/** A fresh module per test: the restart budget is module state. */
const load = () => import('./sim');

describe('CoreSimulatorService recovery', () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    run.mockReset();
    restartCompanion.mockClear();
    process.env.CI = 'true';
    delete process.env.E2E_RESTART_SIM_SERVICE;
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...env };
  });

  it('restarts the service, brings the device back and retries a hung uninstall once', async () => {
    let uninstalls = 0;
    run.mockImplementation(async (cmd, args) => (cmd === 'xcrun' && args[1] === 'uninstall' && uninstalls++ === 0 ? hung() : ok()));
    const sim = await load();
    await settle(sim.uninstall());
    expect(kills().map(([cmd, args]) => [cmd, args])).toEqual([['killall', ['-9', 'com.apple.CoreSimulator.CoreSimulatorService']]]);
    expect(calls('boot')).toHaveLength(1);
    expect(calls('uninstall')).toHaveLength(2);
    expect(restartCompanion).toHaveBeenCalledOnce();
  });

  it('retries a hung app launch after the restart', async () => {
    let launches = 0;
    run.mockImplementation(async (cmd, args) =>
      (cmd === 'xcrun' && args[1] === 'launch' && args[3] === 'app.padeljam' && launches++ === 0 ? hung() : ok()));
    const sim = await load();
    await settle(sim.launch());
    expect(kills()).toHaveLength(1);
    expect(launches).toBe(2);
  });

  it('spends at most one restart per suite', async () => {
    run.mockImplementation(async (cmd, args) => (cmd === 'xcrun' && args[1] === 'uninstall' ? hung() : ok()));
    const sim = await load();
    await expect(settle(sim.uninstall())).rejects.toThrow(/simctl uninstall [\s\S]*timed out after 120s/);
    await expect(settle(sim.uninstall())).rejects.toThrow(/timed out/);
    expect(kills()).toHaveLength(1);
  });

  it('leaves a failure with output alone — that is the device answering', async () => {
    run.mockImplementation(async (cmd, args) => (cmd === 'xcrun' && args[1] === 'uninstall' ? failed() : ok()));
    const sim = await load();
    await expect(settle(sim.uninstall())).rejects.toThrow(/No devices are booted/);
    expect(kills()).toHaveLength(0);
  });

  it('never kills the service outside CI unless asked', async () => {
    delete process.env.CI;
    run.mockImplementation(async (cmd, args) => (cmd === 'xcrun' && args[1] === 'uninstall' ? hung() : ok()));
    const sim = await load();
    await expect(settle(sim.uninstall())).rejects.toThrow(/timed out/);
    expect(kills()).toHaveLength(0);

    vi.resetModules();
    process.env.E2E_RESTART_SIM_SERVICE = '1';
    const optedIn = await load();
    await expect(settle(optedIn.uninstall())).rejects.toThrow(/timed out/); // retry hangs too
    expect(kills()).toHaveLength(1);
  });
});
