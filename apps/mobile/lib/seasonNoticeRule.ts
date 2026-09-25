// Kept apart from seasonNotice.ts so the rule is testable without AsyncStorage.

/**
 * The closed season to announce, or null. `latestClosed` is the highest season number with an
 * end date. Pure, so the rule is testable without storage.
 */
export function seasonToAnnounce(latestClosed: number | null, seen: number | null): number | null {
  if (latestClosed == null) return null;
  if (seen == null) return null; // first visit: record, do not announce
  return latestClosed > seen ? latestClosed : null;
}
