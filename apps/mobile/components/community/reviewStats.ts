/**
 * The score distribution behind UX-COMM-13's bar chart.
 *
 * Derived on the client rather than asked of the server: `useCommunityReviews`
 * already fetches every review to compute the average, so the counts are sitting
 * in memory and a second round trip would buy nothing.
 */
export type ScoreBucket = {
  /** 5 down to 1 — the order a distribution chart is read in. */
  score: number;
  count: number;
  /**
   * Bar width, 0–1, relative to the BUSIEST score rather than to the total.
   *
   * Scaling to the total makes every bar short as soon as the scores spread out
   * — 10 fives and 8 fours become 55% and 44%, two stubs of nearly equal length,
   * and the shape of the distribution disappears exactly when it gets
   * interesting. Against the max they read 100% and 80%, which is the comparison
   * someone is actually making. The counts are printed beside the bars, so the
   * absolute numbers are never inferred from length.
   */
  fraction: number;
};

export const SCORES = [5, 4, 3, 2, 1] as const;

export function reviewDistribution(reviews: { rating: number }[]): ScoreBucket[] {
  const counts = new Map<number, number>(SCORES.map((s) => [s, 0]));
  for (const r of reviews) {
    // Anything outside 1-5 is not a score this chart can show. The column is
    // constrained, but a constraint is not a guarantee about data already
    // written, and a stray 0 or 6 must not silently distort every bar.
    if (counts.has(r.rating)) counts.set(r.rating, (counts.get(r.rating) ?? 0) + 1);
  }

  const max = Math.max(...counts.values());

  return SCORES.map((score) => {
    const count = counts.get(score) ?? 0;
    return { score, count, fraction: max === 0 ? 0 : count / max };
  });
}
