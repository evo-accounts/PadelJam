import { describe, expect, it } from 'vitest';
import { venueImagePath } from './mutations';

describe('venueImagePath', () => {
  it('is a flat {uuid}.{ext} path with a lowercased extension', () => {
    expect(venueImagePath('Court.PNG', 'abc')).toBe('abc.png');
  });
  it('falls back to jpg for a missing or odd extension', () => {
    expect(venueImagePath('photo', 'abc')).toBe('abc.jpg');
    expect(venueImagePath('x.we!rd', 'abc')).toBe('abc.jpg');
  });
});
