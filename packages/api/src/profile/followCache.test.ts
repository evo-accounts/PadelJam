import { describe, expect, it } from 'vitest';
import { withPlayerViewerState } from './followCache';

const a = { id: 'a', viewer_state: 'none' };
const b = { id: 'b', viewer_state: 'none' };

describe('withPlayerViewerState', () => {
  it('sets the state on a rail (array) row', () => {
    expect(withPlayerViewerState([a, b], 'b', 'following')).toEqual([a, { id: 'b', viewer_state: 'following' }]);
  });

  it('sets the state inside infinite-query pages and keeps pageParams', () => {
    const data = { pages: [[a], [b]], pageParams: [0, 20] };
    const out = withPlayerViewerState(data, 'b', 'following') as typeof data;
    expect(out.pages[1]?.[0]?.viewer_state).toBe('following');
    expect(out.pages[0]).toBe(data.pages[0]);
    expect(out.pageParams).toBe(data.pageParams);
  });

  it('returns the same reference when the player is not cached or already in that state', () => {
    const rail = [a, b];
    expect(withPlayerViewerState(rail, 'z', 'following')).toBe(rail);
    expect(withPlayerViewerState(rail, 'a', 'none')).toBe(rail);
    const data = { pages: [[a]], pageParams: [0] };
    expect(withPlayerViewerState(data, 'z', 'following')).toBe(data);
    expect(withPlayerViewerState(undefined, 'a', 'following')).toBeUndefined();
  });
});
