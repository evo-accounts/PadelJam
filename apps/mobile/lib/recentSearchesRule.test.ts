import { describe, expect, it } from 'vitest';
import { addRecent, parseRecents, RECENT_SEARCHES_MAX } from './recentSearchesRule';

describe('addRecent', () => {
  it('puts the newest term first', () => {
    expect(addRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('deduplicates case-insensitively, keeping the latest spelling at the front', () => {
    expect(addRecent(['Lisboa', 'padel'], 'lisboa')).toEqual(['lisboa', 'padel']);
  });

  it('trims, and ignores a blank term', () => {
    expect(addRecent(['a'], '  b  ')).toEqual(['b', 'a']);
    expect(addRecent(['a'], '   ')).toEqual(['a']);
  });

  it('keeps at most ten', () => {
    const ten = Array.from({ length: RECENT_SEARCHES_MAX }, (_, i) => `q${i}`);
    const next = addRecent(ten, 'new');
    expect(next).toHaveLength(RECENT_SEARCHES_MAX);
    expect(next[0]).toBe('new');
    expect(next).not.toContain('q9');
  });
});

describe('parseRecents', () => {
  it('reads a stored list and drops anything that is not a string', () => {
    expect(parseRecents(JSON.stringify(['a', 1, 'b']))).toEqual(['a', 'b']);
  });

  it('reads missing, malformed or non-array values as empty', () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents('{oops')).toEqual([]);
    expect(parseRecents('{"a":1}')).toEqual([]);
  });
});
