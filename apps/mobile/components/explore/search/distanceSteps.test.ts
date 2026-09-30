import { describe, expect, it } from 'vitest';
import { DISTANCE_STOPS, kmAt, stopAt, stopOf, THUMB } from './distanceSteps';

describe('distance stops', () => {
  it('maps values to stops and back, with "Any" last', () => {
    expect(DISTANCE_STOPS).toBe(6);
    expect([5, 10, 25, 50, 100].map(stopOf)).toEqual([0, 1, 2, 3, 4]);
    expect(stopOf(null)).toBe(5);
    expect(stopOf(7)).toBe(5);
    expect([0, 1, 2, 3, 4, 5].map(kmAt)).toEqual([5, 10, 25, 50, 100, null]);
  });

  it('snaps a touch to the nearest stop, clamped to the track', () => {
    const width = 300 + THUMB; // 60 pt between stops
    expect(stopAt(THUMB / 2, width)).toBe(0);
    expect(stopAt(THUMB / 2 + 60 * 2 + 20, width)).toBe(2);
    expect(stopAt(THUMB / 2 + 60 * 2 + 40, width)).toBe(3);
    expect(stopAt(-50, width)).toBe(0);
    expect(stopAt(width + 50, width)).toBe(5);
  });
});
