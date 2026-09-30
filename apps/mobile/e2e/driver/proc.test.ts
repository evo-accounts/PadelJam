import { describe, expect, it } from 'vitest';

import { describeExit, describeFailure, describeOutput, run, type RunResult } from './proc';

const result = (over: Partial<RunResult>): RunResult => ({
  stdout: '',
  stderr: '',
  code: 1,
  timedOut: false,
  signal: null,
  timeoutMs: 120_000,
  ...over,
});

describe('run', () => {
  // The distinction that was missing on CI run 36713494350: all three of these
  // used to come back as code 1, and the first two with no output at all.
  it('reports our own timeout as a timeout, not as exit 1', async () => {
    const r = await run('sleep', ['5'], { timeoutMs: 200 });
    expect(r.code).not.toBe(0);
    expect(r.timedOut).toBe(true);
    expect(describeExit(r)).toBe('timed out after 0s and was killed');
  });

  it('reports a process killed by a signal', async () => {
    const r = await run('sh', ['-c', 'kill -9 $$']);
    expect(r.timedOut).toBe(false);
    expect(describeExit(r)).toBe('killed by SIGKILL');
  });

  it('reports a real exit code, with both streams', async () => {
    const r = await run('sh', ['-c', 'echo to-out; echo to-err >&2; exit 3']);
    expect(r).toMatchObject({ code: 3, timedOut: false, signal: null });
    expect(describeFailure('sh', ['-c', '…'], r)).toBe('sh -c … failed (exit 3):\nstderr: to-err\nstdout: to-out');
  });
});

describe('describeOutput', () => {
  it('says so explicitly when nothing was printed', () => {
    expect(describeOutput(result({}))).toBe('(nothing on stdout or stderr)');
    expect(describeOutput(result({ stdout: '\n', stderr: '  ' }))).toBe('(nothing on stdout or stderr)');
  });

  it('keeps stdout when stderr is empty — simctl sometimes reports there', () => {
    expect(describeOutput(result({ stdout: 'An error was encountered processing the command' })))
      .toBe('stdout: An error was encountered processing the command');
  });

  it('clips a runaway stream', () => {
    const out = describeOutput(result({ stdout: 'x'.repeat(10_000) }));
    expect(out.length).toBeLessThan(4_100);
    expect(out).toMatch(/\[6000 more chars\]$/);
  });
});

describe('describeExit', () => {
  it('rounds the timeout to seconds', () => {
    expect(describeExit(result({ timedOut: true, signal: 'SIGTERM', timeoutMs: 120_000 })))
      .toBe('timed out after 120s and was killed');
  });

  it('is the plain exit code otherwise', () => {
    expect(describeExit(result({ code: 149 }))).toBe('exit 149');
  });
});
