'use client';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Explore's recent searches (UX-EXPL-04, D5): kept in this browser only, never synced — capped at
 * 10, most recent first, deduplicated case-insensitively (the latest spelling wins).
 *
 * Keyed per user, so two people sharing a browser do not see each other's queries. Every access is
 * guarded: storage can be missing or throw (private mode, blocked site data), and a lost list only
 * means the block is hidden.
 */
export const RECENT_SEARCHES_MAX = 10;

const key = (uid: string) => `padeljam:explore:recent-searches:${uid}`;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('padeljam:explore:recent-searches:')) l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
};

/** Push `term` to the front, drop any case-insensitive duplicate, keep the newest `max`. */
export function addRecent(list: readonly string[], term: string, max = RECENT_SEARCHES_MAX): string[] {
  const text = term.trim();
  if (!text) return [...list];
  const lower = text.toLocaleLowerCase();
  return [text, ...list.filter((t) => t.toLocaleLowerCase() !== lower)].slice(0, max);
}

// useSyncExternalStore needs a stable snapshot: cache the parsed list per raw string.
let cacheRaw: string | null = null;
let cacheList: string[] = [];
const EMPTY: string[] = [];

function read(uid: string): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key(uid));
  } catch {
    return EMPTY;
  }
  if (raw === cacheRaw) return cacheList;
  cacheRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cacheList = Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_SEARCHES_MAX)
      : [];
  } catch {
    cacheList = [];
  }
  return cacheList;
}

function write(uid: string, list: string[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(key(uid));
    else window.localStorage.setItem(key(uid), JSON.stringify(list));
  } catch {
    /* storage unavailable: the list simply is not kept */
  }
  emit();
}

/** The viewer's recent searches plus add / remove / clear. Empty on the server and without a user. */
export function useRecentSearches(uid: string | undefined) {
  const list = useSyncExternalStore(
    subscribe,
    () => (uid ? read(uid) : EMPTY),
    () => EMPTY,
  );
  const add = useCallback((term: string) => uid && write(uid, addRecent(read(uid), term)), [uid]);
  const remove = useCallback(
    (term: string) => uid && write(uid, read(uid).filter((t) => t !== term)),
    [uid],
  );
  const clear = useCallback(() => uid && write(uid, []), [uid]);
  return { recents: list, add, remove, clear };
}
