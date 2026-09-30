import { describe, expect, it } from 'vitest';
import { exploreSearchHref, isExploreSearchTab } from './exploreLinks';

describe('exploreSearchHref', () => {
  it('opens Explore in search mode on the named tab', () => {
    expect(exploreSearchHref('events')).toBe('/(tabs)/explore?search=1&tab=events');
    expect(exploreSearchHref('communities')).toBe('/(tabs)/explore?search=1&tab=communities');
  });

  it('carries a run query and an arrival stamp when given', () => {
    expect(exploreSearchHref('all', { q: 'padel & co', at: 42 })).toBe(
      '/(tabs)/explore?search=1&tab=all&q=padel%20%26%20co&at=42',
    );
    expect(exploreSearchHref('groups', { q: '' })).toBe('/(tabs)/explore?search=1&tab=groups&q=');
  });
});

describe('isExploreSearchTab', () => {
  it('accepts the four result tabs only', () => {
    expect(['all', 'events', 'groups', 'communities'].every(isExploreSearchTab)).toBe(true);
    expect(isExploreSearchTab('players')).toBe(false);
    expect(isExploreSearchTab('foryou')).toBe(false);
    expect(isExploreSearchTab(undefined)).toBe(false);
  });
});
