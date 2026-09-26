import { describe, expect, it } from 'vitest';

import { isPreset, minutesAt, parseCustomPoints, POINTS_PRESETS, scoringDefault } from './scoring';

describe('scoring defaults (B16, decision 9)', () => {
  it('starts Points at 32 and Time at 10 minutes', () => {
    expect(scoringDefault('points')).toBe(32);
    expect(scoringDefault('time')).toBe(10);
    expect(scoringDefault('classic')).toBeNull();
  });

  it('offers the audit presets, 32 among them', () => {
    expect([...POINTS_PRESETS]).toEqual([8, 11, 16, 21, 24, 32, 40]);
    expect(isPreset(32)).toBe(true);
    expect(isPreset(50)).toBe(false);
    expect(isPreset(null)).toBe(false);
  });
});

describe('parseCustomPoints', () => {
  it('accepts whole numbers from 1 to 99', () => {
    expect(parseCustomPoints('1')).toBe(1);
    expect(parseCustomPoints(' 50 ')).toBe(50);
    expect(parseCustomPoints('99')).toBe(99);
  });

  it('rejects anything else', () => {
    for (const bad of ['', '0', '100', '-3', '4.5', 'abc', '1e2']) {
      expect(parseCustomPoints(bad), bad).toBeNull();
    }
  });
});

describe('minutesAt', () => {
  it('maps the track onto 1–90 whole minutes, clamped', () => {
    expect(minutesAt(0)).toBe(1);
    expect(minutesAt(1)).toBe(90);
    expect(minutesAt(0.5)).toBe(46);
    expect(minutesAt(-1)).toBe(1);
    expect(minutesAt(2)).toBe(90);
    expect(minutesAt(Number.NaN)).toBe(1);
  });
});
