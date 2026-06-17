import { describe, expect, it } from 'vitest';
import {
  JOIN_CUTOFF_MS,
  LEAVE_CUTOFF_MS,
  deadlineState,
  formatCountdown,
} from './eventDeadlines';

const START = '2026-06-20T18:00:00.000Z';
const START_MS = Date.parse(START);

describe('deadlineState', () => {
  it('join is open just before the 6h cutoff, closed just after', () => {
    const justBefore = deadlineState(START, START_MS - JOIN_CUTOFF_MS - 60_000);
    expect(justBefore.joinClosed).toBe(false);
    const justAfter = deadlineState(START, START_MS - JOIN_CUTOFF_MS + 60_000);
    expect(justAfter.joinClosed).toBe(true);
    expect(justBefore.joinCutoffMs).toBe(START_MS - JOIN_CUTOFF_MS);
  });

  it('leave is open just before the 12h cutoff, locked just after', () => {
    const justBefore = deadlineState(START, START_MS - LEAVE_CUTOFF_MS - 60_000);
    expect(justBefore.leaveLocked).toBe(false);
    const justAfter = deadlineState(START, START_MS - LEAVE_CUTOFF_MS + 60_000);
    expect(justAfter.leaveLocked).toBe(true);
    expect(justBefore.leaveCutoffMs).toBe(START_MS - LEAVE_CUTOFF_MS);
  });

  it('fails open on an unparseable start time', () => {
    const s = deadlineState('not-a-date', START_MS);
    expect(s.joinClosed).toBe(false);
    expect(s.leaveLocked).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('returns empty for zero or negative', () => {
    expect(formatCountdown(0)).toBe('');
    expect(formatCountdown(-5000)).toBe('');
  });
  it('sub-minute shows <1m', () => {
    expect(formatCountdown(30_000)).toBe('<1m');
  });
  it('minutes only under an hour', () => {
    expect(formatCountdown(5 * 60_000)).toBe('5m');
  });
  it('hours and minutes under a day', () => {
    expect(formatCountdown(90 * 60_000)).toBe('1h 30m');
  });
  it('days and hours at or above a day', () => {
    expect(formatCountdown((26 * 60) * 60_000)).toBe('1d 2h');
  });
});
