/**
 * "The season has ended" — shown once to each member, the next time they open the group after an
 * admin resets the ranking (UX-GRP-14). Web's twin of mobile's `lib/seasonNotice.ts`: what each
 * member has already seen is kept in the browser (decision 9 of the Groups audit plan — no table),
 * so a new browser showing it once more costs nothing.
 *
 * Stored per group as the highest CLOSED season number seen. A first visit records the latest
 * closed season silently, so joining a group with history never greets you with old news.
 */
import { useSyncExternalStore } from 'react';

const key = (groupId: string) => `group-season-seen:${groupId}`;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function lastSeenSeason(groupId: string): number | null {
  try {
    const raw = window.localStorage.getItem(key(groupId));
    return raw == null ? null : Number(raw);
  } catch {
    return null;
  }
}

export function markSeasonSeen(groupId: string, seasonNumber: number): void {
  try {
    const seen = lastSeenSeason(groupId);
    if (seen == null || seasonNumber > seen) {
      window.localStorage.setItem(key(groupId), String(seasonNumber));
      listeners.forEach((l) => l());
    }
  } catch {
    /* a lost marker only means the notice shows again */
  }
}

/** The last closed season this browser has seen for the group, kept current as it is marked. */
export function useLastSeenSeason(groupId: string): number | null {
  return useSyncExternalStore(
    subscribe,
    () => lastSeenSeason(groupId),
    () => null,
  );
}

/** The closed season to announce, or null (same rule as mobile's seasonNoticeRule.ts). */
export function seasonToAnnounce(latestClosed: number | null, seen: number | null): number | null {
  if (latestClosed == null) return null;
  if (seen == null) return null; // first visit: record, do not announce
  return latestClosed > seen ? latestClosed : null;
}
