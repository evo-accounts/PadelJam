/**
 * The rules of Explore's recent searches (UX-EXPL-04, D5), kept apart from the storage so they
 * can be tested without AsyncStorage: at most 10, most recent first, deduplicated
 * case-insensitively with the latest spelling winning. The same rules as web's
 * `apps/web/src/lib/recent-searches.ts`.
 */
export const RECENT_SEARCHES_MAX = 10;

/** Push `term` to the front, drop any case-insensitive duplicate, keep the newest `max`. */
export function addRecent(list: readonly string[], term: string, max = RECENT_SEARCHES_MAX): string[] {
  const text = term.trim();
  if (!text) return [...list];
  const lower = text.toLocaleLowerCase();
  return [text, ...list.filter((t) => t.toLocaleLowerCase() !== lower)].slice(0, max);
}

/** A stored value back as a list: anything that is not an array of strings reads as empty. */
export function parseRecents(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_SEARCHES_MAX)
      : [];
  } catch {
    return [];
  }
}
