import { describe, expect, it } from 'vitest';
import { withSticky, type StickyEntry } from './stickyRows';

const row = (id: string) => ({ id });
const entry = (id: string, index: number): StickyEntry<{ id: string }> => ({
  row: row(id),
  index,
  state: 'following',
});

describe('withSticky', () => {
  it('returns the rows untouched when nothing was acted on', () => {
    const rows = [row('a'), row('b')];
    expect(withSticky(rows, {})).toBe(rows);
  });

  it('does not duplicate a row the refetch still returns', () => {
    expect(withSticky([row('a'), row('b')], { b: entry('b', 1) }).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('puts a row the refetch dropped back at the index it had', () => {
    expect(withSticky([row('a'), row('c')], { b: entry('b', 1) }).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('re-inserts several in index order and clamps past the end', () => {
    const out = withSticky([row('c')], { a: entry('a', 0), b: entry('b', 1), z: entry('z', 9) });
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c', 'z']);
  });
});
