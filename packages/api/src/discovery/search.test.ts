import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';
import {
  EVENT_TYPE_FILTERS,
  SEARCH_DISTANCE_STEPS_KM,
  compactSearchFilters,
  countSearchFilters,
} from './search';

describe('compactSearchFilters', () => {
  it('drops every value that narrows nothing', () => {
    expect(
      compactSearchFilters({ free: false, recurring: undefined, max_km: null, types: [], date_from: '' }),
    ).toEqual({});
    expect(compactSearchFilters(null)).toEqual({});
  });
  it('keeps real filters, with sorted keys and arrays so equal filters make equal keys', () => {
    const a = compactSearchFilters({ types: ['mexicano:mixed', 'americano:classic'], free: true, max_km: 25 });
    const b = compactSearchFilters({ max_km: 25, free: true, types: ['americano:classic', 'mexicano:mixed'] });
    expect(a).toEqual({ free: true, max_km: 25, types: ['americano:classic', 'mexicano:mixed'] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('does not mutate the caller’s arrays', () => {
    const types = ['team', 'club'] as const;
    compactSearchFilters({ types: [...types] });
    expect(types).toEqual(['team', 'club']);
  });
});

describe('countSearchFilters', () => {
  it('counts each chip and each scalar filter once', () => {
    expect(countSearchFilters({})).toBe(0);
    expect(countSearchFilters({ types: ['club', 'team'], with_upcoming: true, max_km: 10 })).toBe(4);
    expect(countSearchFilters({ free: false, privacy: [] })).toBe(0);
  });
});

describe('search constants', () => {
  it('has the nine event type chips of D4, each a valid pair, no duplicates', () => {
    expect(EVENT_TYPE_FILTERS).toHaveLength(9);
    expect(new Set(EVENT_TYPE_FILTERS).size).toBe(9);
    expect(EVENT_TYPE_FILTERS).toContain('up_and_down:mixed');
  });
  it('has the stepped distance values of D13', () => {
    expect(SEARCH_DISTANCE_STEPS_KM).toEqual([5, 10, 25, 50, 100]);
  });
});

describe('search query keys', () => {
  it('sit under each type’s explore prefix, so existing invalidations reach them', () => {
    expect(qk.searchPlayers('ana').slice(0, 2)).toEqual(qk.explorePlayers);
    expect(qk.searchEvents('x', {}, 'date').slice(0, 2)).toEqual(qk.exploreEvents);
    expect(qk.searchGroups('x', {}, 'recent').slice(0, 2)).toEqual(qk.exploreGroups);
    expect(qk.searchCommunities('x', {}, 'distance').slice(0, 2)).toEqual(qk.exploreCommunities);
    expect(qk.searchSuggest('a')[0]).toBe('explore');
    expect(qk.searchForYouTerms).toEqual(['explore', 'for-you']);
  });
});
