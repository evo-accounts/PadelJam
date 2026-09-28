import { describe, expect, it } from 'vitest';

import { donutArc } from './donutArc';

describe('donutArc', () => {
  it('fills the ratio of the circumference', () => {
    const a = donutArc(3, 12, 64, 8);
    expect(a.r).toBe(28);
    expect(a.fraction).toBeCloseTo(0.25);
    expect(a.dashOffset).toBeCloseTo(a.circumference * 0.75);
  });

  it('is empty with nothing to count and full at the total', () => {
    expect(donutArc(0, 0, 64, 8).fraction).toBe(0);
    expect(donutArc(5, 0, 64, 8).dashOffset).toBeCloseTo(donutArc(5, 0, 64, 8).circumference);
    expect(donutArc(8, 8, 64, 8).dashOffset).toBeCloseTo(0);
  });

  it('clamps over-full and non-finite values', () => {
    expect(donutArc(14, 12, 64, 8).fraction).toBe(1);
    expect(donutArc(-1, 12, 64, 8).fraction).toBe(0);
    expect(donutArc(Number.NaN, 12, 64, 8).fraction).toBe(0);
  });
});
