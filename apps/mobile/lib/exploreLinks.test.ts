import { describe, expect, it } from 'vitest';
import { exploreSearchHref } from './exploreLinks';

describe('exploreSearchHref', () => {
  it('opens Explore in search mode on the named tab', () => {
    expect(exploreSearchHref('events')).toBe('/(tabs)/explore?search=1&tab=events');
    expect(exploreSearchHref('communities')).toBe('/(tabs)/explore?search=1&tab=communities');
  });
});
