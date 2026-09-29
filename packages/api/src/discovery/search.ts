import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import type { Database } from '@padel/db';
import { useDb } from '../client';
import { qk } from '../query-keys';
import { COMMUNITY_TYPES, type EventType, type Specification } from '../schemas';
import type { CommunityViewerState, GroupViewerState, PlayerViewerState } from './queries';

type Fns = Database['public']['Functions'];
/** The generated jsonb argument type. */
type JsonArg = Fns['search_events']['Args']['p_filters'];

// ---------------------------------------------------------------------------------------------
// Discovery search (migration 0129; UX-EXPL-04..08, decisions D1, D4, D6, D7, D8, D13).
//
// Shared by mobile and web. Filters are plain objects that go to the RPC as `p_filters` (jsonb);
// `compactSearchFilters` drops every "no filter" value first, so the query key is stable and the
// server only sees keys that narrow something.
// ---------------------------------------------------------------------------------------------

export const SEARCH_PAGE_SIZE = 20;

/** The stepped distance control (D13): "Up to N km". */
export const SEARCH_DISTANCE_STEPS_KM = [5, 10, 25, 50, 100] as const;

// --- Filters and sorts ---

/** One of the nine event type chips (D4): `event_type:specification`. */
export type EventTypeFilter = `${EventType}:${Specification}`;

/** The nine chips in the audit's order, plus Mixed Up and Down (D4) at the end. */
export const EVENT_TYPE_FILTERS: readonly EventTypeFilter[] = [
  'americano:classic',
  'mexicano:classic',
  'up_and_down:classic',
  'americano:mixed',
  'americano:team',
  'mexicano:mixed',
  'mexicano:team',
  'up_and_down:team',
  'up_and_down:mixed',
];

export type EventSearchSort = 'relevant' | 'date' | 'distance';
export type GroupSearchSort = 'relevant' | 'recent' | 'distance';
export type CommunitySearchSort = 'relevant' | 'recent' | 'distance';

export type EventSearchFilters = {
  /** 'YYYY-MM-DD' (00:00 UTC) or an ISO timestamp; starts_at >= it. */
  date_from?: string | null;
  /** 'YYYY-MM-DD' (the whole UTC day) or an ISO timestamp (inclusive). Prefer ISO with offset. */
  date_to?: string | null;
  types?: EventTypeFilter[];
  /** A row with no distance (no point on either side) never matches (D2). */
  max_km?: number | null;
  /** Fee disabled or zero (D13). */
  free?: boolean;
  /** Part of a series (D13). */
  recurring?: boolean;
};

export type GroupSearchFilters = {
  /** Only the viewer's own communities apply; any other id is ignored and matches nothing. */
  community_ids?: string[];
  /** Measured to the parent community's point (D2). */
  max_km?: number | null;
  with_upcoming?: boolean;
};

export type CommunityType = (typeof COMMUNITY_TYPES)[number];
export type CommunityPrivacy = 'public' | 'request_to_join' | 'private';

export type CommunitySearchFilters = {
  types?: CommunityType[];
  max_km?: number | null;
  /** 'private' only ever matches the viewer's own private communities. */
  privacy?: CommunityPrivacy[];
  with_upcoming?: boolean;
};

/**
 * Drop every value that does not narrow anything — undefined, null, false, '' and empty arrays —
 * and sort the keys, so `{}` and `{ free: false, types: [] }` are the same query (and query key).
 */
export function compactSearchFilters<T extends object>(filters: T | null | undefined): Partial<T> {
  const out: Record<string, unknown> = {};
  if (!filters) return out as Partial<T>;
  for (const key of Object.keys(filters).sort()) {
    const v = (filters as Record<string, unknown>)[key];
    if (v === undefined || v === null || v === false || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[key] = Array.isArray(v) ? [...v].sort() : v;
  }
  return out as Partial<T>;
}

/** How many filters are applied — the badge on the filter control. */
export const countSearchFilters = (filters: object | null | undefined) =>
  Object.values(compactSearchFilters(filters)).reduce<number>(
    (n, v) => n + (Array.isArray(v) ? v.length : 1),
    0,
  );

// --- Rows ---

/** 'organizer', the viewer's roster status, or 'none'. */
export type EventViewerState = 'organizer' | 'confirmed' | 'waiting_list' | 'interested' | 'invited' | 'none';

type Strip<T> = Omit<T, 'viewer_state' | 'total_count'>;

export type SearchPlayer = Strip<Fns['search_players']['Returns'][number]> & {
  viewer_state: PlayerViewerState;
};
/** The whole events row (the explore_events shape, so EventCard takes it) + distance and state. */
export type SearchEvent = Database['public']['Tables']['events']['Row'] & {
  distance_m: number | null;
  viewer_state: EventViewerState;
};
export type SearchGroup = Strip<Fns['search_groups']['Returns'][number]> & {
  viewer_state: GroupViewerState;
};
export type SearchCommunity = Strip<Fns['search_communities']['Returns'][number]> & {
  viewer_state: CommunityViewerState;
};

export type SearchSuggestionKind = 'player' | 'event' | 'community' | 'group';
export type SearchSuggestion = { kind: SearchSuggestionKind; id: string; label: string };

/**
 * A "For you" chip (D6). `format` values are machine event types ('americano' | 'mexicano' |
 * 'up_and_down') for the client to localize; `city` and `community` are shown as they are.
 */
export type ForYouTerm =
  | { kind: 'city'; value: string }
  | { kind: 'format'; value: EventType }
  | { kind: 'community'; value: string };

/** What every paged search hook's `data` is: the loaded rows and the server's total match count. */
export type SearchResults<T> = { items: T[]; totalCount: number };

type Page<T> = { rows: T[]; total: number };

const nextOffset = <T>(last: Page<T>, all: Page<T>[]) => {
  const loaded = all.reduce((n, p) => n + p.rows.length, 0);
  return last.rows.length < SEARCH_PAGE_SIZE || loaded >= last.total ? undefined : loaded;
};

const flatten = <T>(data: { pages: Page<T>[] }): SearchResults<T> => ({
  items: data.pages.flatMap((p) => p.rows),
  totalCount: data.pages[0]?.total ?? 0,
});

const page = <R extends { total_count: number }, T>(rows: R[] | null, map: (r: R) => T): Page<T> => ({
  rows: (rows ?? []).map(map),
  total: Number(rows?.[0]?.total_count ?? 0),
});

type SearchOptions = { enabled?: boolean };

// --- Paged search hooks ---
//
// A blank query is a valid search: it returns everything visible in the sort's order, so a
// filter sheet applied to an empty input works. Callers debounce the text themselves.

/** Players (D8: every onboarded, non-blocked profile). Shown only in the All tab. */
export const useSearchPlayers = (q: string, opts: SearchOptions = {}) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  const text = q.trim();
  return useInfiniteQuery({
    queryKey: qk.searchPlayers(text),
    enabled: !!uid && (opts.enabled ?? true),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('search_players', {
        p_q: text,
        p_limit: SEARCH_PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return page(data, ({ total_count: _t, ...r }) => r as SearchPlayer);
    },
    getNextPageParam: nextOffset,
    select: flatten,
  });
};

export const useSearchEvents = (
  q: string,
  filters: EventSearchFilters = {},
  sort: EventSearchSort = 'relevant',
  opts: SearchOptions = {},
) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  const text = q.trim();
  const f = compactSearchFilters(filters);
  return useInfiniteQuery({
    queryKey: qk.searchEvents(text, f, sort),
    enabled: !!uid && (opts.enabled ?? true),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('search_events', {
        p_q: text,
        p_filters: f as JsonArg,
        p_sort: sort,
        p_limit: SEARCH_PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return page(
        data,
        (r) => ({ ...r.event, distance_m: r.distance_m, viewer_state: r.viewer_state }) as SearchEvent,
      );
    },
    getNextPageParam: nextOffset,
    select: flatten,
  });
};

/** Public groups plus the viewer's own, private ones included (D1). No privacy filter. */
export const useSearchGroups = (
  q: string,
  filters: GroupSearchFilters = {},
  sort: GroupSearchSort = 'relevant',
  opts: SearchOptions = {},
) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  const text = q.trim();
  const f = compactSearchFilters(filters);
  return useInfiniteQuery({
    queryKey: qk.searchGroups(text, f, sort),
    enabled: !!uid && (opts.enabled ?? true),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('search_groups', {
        p_q: text,
        p_filters: f as JsonArg,
        p_sort: sort,
        p_limit: SEARCH_PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return page(data, ({ total_count: _t, ...r }) => r as SearchGroup);
    },
    getNextPageParam: nextOffset,
    select: flatten,
  });
};

export const useSearchCommunities = (
  q: string,
  filters: CommunitySearchFilters = {},
  sort: CommunitySearchSort = 'relevant',
  opts: SearchOptions = {},
) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  const text = q.trim();
  const f = compactSearchFilters(filters);
  return useInfiniteQuery({
    queryKey: qk.searchCommunities(text, f, sort),
    enabled: !!uid && (opts.enabled ?? true),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('search_communities', {
        p_q: text,
        p_filters: f as JsonArg,
        p_sort: sort,
        p_limit: SEARCH_PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return page(data, ({ total_count: _t, ...r }) => r as SearchCommunity);
    },
    getNextPageParam: nextOffset,
    select: flatten,
  });
};

// --- Typeahead and For you ---

/**
 * Typeahead suggestions (D7): up to 8 names, prefix matches first. Runs once the trimmed query has
 * a character; the caller debounces (~150 ms). Keeps the previous list while the next one loads.
 */
export const useSearchSuggest = (q: string, limit = 8) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  const text = q.trim();
  return useQuery({
    queryKey: qk.searchSuggest(text),
    enabled: !!uid && text.length >= 1,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await db.rpc('search_suggest', { p_q: text, p_limit: limit });
      if (error) throw error;
      return (data ?? []) as SearchSuggestion[];
    },
  });
};

/** The "For you" chips (D6), at most 8. An empty list means: hide the block. */
export const useSearchForYouTerms = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.searchForYouTerms,
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('search_for_you_terms');
      if (error) throw error;
      return (data ?? []) as ForYouTerm[];
    },
  });
};
