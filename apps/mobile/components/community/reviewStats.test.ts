import { describe, expect, it } from 'vitest';

import { reviewDistribution } from './reviewStats';

const ratings = (...values: number[]) => values.map((rating) => ({ rating }));

describe('reviewDistribution', () => {
  it('reads 5 down to 1, the order a distribution chart is read in', () => {
    expect(reviewDistribution([]).map((b) => b.score)).toEqual([5, 4, 3, 2, 1]);
  });

  it('gives every score a bucket, including the ones nobody chose', () => {
    const buckets = reviewDistribution(ratings(5, 5, 3));
    expect(buckets.map((b) => b.count)).toEqual([2, 0, 1, 0, 0]);
  });

  it('returns an all-zero chart for no reviews, rather than dividing by zero', () => {
    const buckets = reviewDistribution([]);
    expect(buckets.every((b) => b.count === 0 && b.fraction === 0)).toBe(true);
  });

  /**
   * The busiest score is the yardstick, not the total. 10 fives and 8 fours
   * against the total would be 55% and 44% — two stubs of nearly equal length,
   * with the shape of the distribution lost exactly where it matters.
   */
  it('scales bars against the busiest score', () => {
    const buckets = reviewDistribution(ratings(...Array(10).fill(5), ...Array(8).fill(4)));
    expect(buckets[0]).toMatchObject({ score: 5, count: 10, fraction: 1 });
    expect(buckets[1]).toMatchObject({ score: 4, count: 8, fraction: 0.8 });
    expect(buckets[2]).toMatchObject({ fraction: 0 });
  });

  it('gives a single score the full bar', () => {
    const buckets = reviewDistribution(ratings(4, 4, 4));
    expect(buckets[1]).toMatchObject({ score: 4, fraction: 1 });
  });

  /**
   * The column is constrained to 1-5, but a constraint is not a guarantee about
   * rows already written — and one stray value would otherwise rescale the whole
   * chart through `max`.
   */
  it('ignores a score outside 1-5 instead of distorting every bar', () => {
    const buckets = reviewDistribution(ratings(5, 0, 6, -1, 99));
    expect(buckets.map((b) => b.count)).toEqual([1, 0, 0, 0, 0]);
    expect(buckets[0]).toMatchObject({ fraction: 1 });
  });
});
