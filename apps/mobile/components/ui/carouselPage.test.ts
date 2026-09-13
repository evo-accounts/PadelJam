import { describe, expect, it } from 'vitest';
import { pageIndex } from './carouselPage';

describe('pageIndex', () => {
  it('maps an exact page offset to that page', () => {
    expect(pageIndex(0, 390, 3)).toBe(0);
    expect(pageIndex(390, 390, 3)).toBe(1);
    expect(pageIndex(780, 390, 3)).toBe(2);
  });

  it('rounds to the nearer page mid-swipe', () => {
    expect(pageIndex(194, 390, 3)).toBe(0);
    expect(pageIndex(196, 390, 3)).toBe(1);
  });

  it('clamps an over-scroll bounce at either end', () => {
    expect(pageIndex(-120, 390, 3)).toBe(0);
    expect(pageIndex(1200, 390, 3)).toBe(2);
  });

  it('is 0 before onLayout has measured a width, instead of NaN', () => {
    expect(pageIndex(0, 0, 3)).toBe(0);
    expect(pageIndex(390, 0, 3)).toBe(0);
  });

  it('is 0 for an empty carousel', () => {
    expect(pageIndex(390, 390, 0)).toBe(0);
  });

  it('survives a negative or non-finite width', () => {
    expect(pageIndex(390, -390, 3)).toBe(0);
    expect(pageIndex(390, Number.NaN, 3)).toBe(0);
  });

  it('tracks a narrower width after a rotation, rather than the old one', () => {
    // The defect this exists to prevent: welcome.tsx reads Dimensions once at
    // MODULE scope, so after a rotation it keeps dividing by the portrait width
    // and reports page 2 while page 1 is on screen.
    expect(pageIndex(844, 844, 3)).toBe(1);
    expect(pageIndex(844, 390, 3)).toBe(2);
  });
});
