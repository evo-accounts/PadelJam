import { describe, expect, it } from 'vitest';
import { compactSearchFilters } from './search';

import {
  EMPTY_EVENTS_FILTERS,
  formatDistanceKm,
  localDayIso,
  toEventFilters,
  toggle,
  typesForFormat,
} from './searchFilters';

describe('typesForFormat', () => {
  it('turns a For you format into every specification of that event type', () => {
    expect(typesForFormat('americano')).toEqual(['americano:classic', 'americano:mixed', 'americano:team']);
    expect(typesForFormat('up_and_down')).toEqual(['up_and_down:classic', 'up_and_down:team', 'up_and_down:mixed']);
  });
});

describe('toggle', () => {
  it('adds a missing value and removes a present one', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('localDayIso', () => {
  it('spans the local calendar day, with the local offset', () => {
    const start = localDayIso('2026-10-03', 'start');
    const end = localDayIso('2026-10-03', 'end');
    expect(start.startsWith('2026-10-03T00:00:00.000')).toBe(true);
    expect(end.startsWith('2026-10-03T23:59:59.999')).toBe(true);
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 3600 * 1000 - 1);
  });
});

describe('toEventFilters', () => {
  it('sends nothing for the empty form', () => {
    expect(compactSearchFilters(toEventFilters(EMPTY_EVENTS_FILTERS))).toEqual({});
  });

  it('sends what the form narrows', () => {
    const f = compactSearchFilters(
      toEventFilters({ ...EMPTY_EVENTS_FILTERS, types: ['mexicano:team'], maxKm: 25, free: true }),
    );
    expect(f).toEqual({ free: true, max_km: 25, types: ['mexicano:team'] });
  });
});

describe('formatDistanceKm', () => {
  it('keeps one decimal under 10 km and whole kilometres from 10 km', () => {
    expect(formatDistanceKm(1000)).toBe('1.0');
    expect(formatDistanceKm(3449)).toBe('3.4');
    expect(formatDistanceKm(9949)).toBe('9.9');
    expect(formatDistanceKm(10_000)).toBe('10');
    expect(formatDistanceKm(26_600)).toBe('27');
  });
});
