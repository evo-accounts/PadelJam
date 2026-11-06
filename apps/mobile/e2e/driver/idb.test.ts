import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type R = { code: number; stdout: string; stderr: string; timedOut: boolean };
const h = vi.hoisted(() => ({ results: [] as R[], calls: [] as string[][], sockAt: Infinity, now: 0 }));

vi.mock('./config', () => ({ CONFIG: { udid: 'U', idbPath: 'idb' } }));
vi.mock('./proc', () => ({
  describeFailure: (_c: string, _a: string[], r: R) => `failed: ${r.stderr}`,
  run: vi.fn(async (cmd: string, args: string[]) => {
    h.calls.push([cmd, ...args]);
    if (cmd === 'pkill') return { code: 0, stdout: '', stderr: '', timedOut: false };
    return h.results.shift();
  }),
}));
vi.mock('node:child_process', () => ({ spawn: () => ({ unref() {} }) }));
vi.mock('node:fs', () => ({
  closeSync: () => {},
  openSync: () => 1,
  readFileSync: () => '',
  rmSync: () => {},
  existsSync: () => Date.now() >= h.sockAt,
}));

const { idb, idbDescribeAll, restartCompanion, COMPANION_START_MS } = await import('./idb');

const ok = (stdout = '[]') => ({ code: 0, stdout, stderr: '', timedOut: false });
const fail = (stderr: string, timedOut = false) => ({ code: 1, stdout: '', stderr, timedOut });
const idbCalls = () => h.calls.filter((c) => c[0] === 'idb').length;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  h.results = [];
  h.calls = [];
  h.sockAt = Infinity;
});
afterEach(() => vi.useRealTimers());

describe('restartCompanion', () => {
  it('waits up to 90 s for the socket, then warns and returns', async () => {
    const p = restartCompanion();
    await vi.advanceTimersByTimeAsync(COMPANION_START_MS + 5_000);
    await p;
    expect(COMPANION_START_MS).toBe(90_000);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('within 90s'));
  });

  it('returns as soon as the socket appears', async () => {
    h.sockAt = Date.now() + 55_000;
    let done = false;
    const p = restartCompanion().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(54_000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    await p;
    expect(done).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('idb No translation object', () => {
  const nt = 'No translation object returned for simulator.';

  it('retries a retryable read once after 3 s', async () => {
    h.results = [fail(nt), ok('tree')];
    const p = idbDescribeAll();
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(p).resolves.toBe('tree');
    expect(idbCalls()).toBe(2);
  });

  it('retries only once', async () => {
    h.results = [fail(nt), fail(nt), ok()];
    const p = idbDescribeAll();
    const assertion = expect(p).rejects.toThrow(/No translation/);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(idbCalls()).toBe(2);
  });

  it('retries when it comes back after a restart', async () => {
    h.sockAt = 0;
    h.results = [fail('Connection lost'), fail(nt), ok('tree')];
    const p = idbDescribeAll();
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(p).resolves.toBe('tree');
    expect(idbCalls()).toBe(3);
  });

  it('does not retry a bounded polling read', async () => {
    h.results = [fail(nt), ok()];
    await expect(idbDescribeAll(8_000)).rejects.toThrow(/No translation/);
    expect(idbCalls()).toBe(1);
  });

  it('does not retry a non-retryable call, nor other errors', async () => {
    h.results = [fail(nt)];
    await expect(idb(['ui', 'tap', '1', '2'])).rejects.toThrow();
    h.results = [fail('something else')];
    await expect(idbDescribeAll()).rejects.toThrow(/something else/);
    expect(idbCalls()).toBe(2);
  });
});
