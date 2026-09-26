import { describe, expect, it } from 'vitest';

import { percentOf } from './progressPercent';

describe('percentOf', () => {
  it('rounds a fraction to a whole percentage', () => {
    expect(percentOf(0)).toBe(0);
    expect(percentOf(3 / 10)).toBe(30);
    expect(percentOf(8 / 9)).toBe(89);
    expect(percentOf(1)).toBe(100);
  });

  it('clamps out-of-range and non-finite input', () => {
    expect(percentOf(-0.2)).toBe(0);
    expect(percentOf(1.5)).toBe(100);
    expect(percentOf(Number.NaN)).toBe(0);
  });
});
