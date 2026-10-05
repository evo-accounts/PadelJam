/** The result tabs of Explore search (UX-EXPL-06). `all` is the default when none is named. */
export type ExploreSearchTab = 'all' | 'events' | 'groups' | 'communities';

export const EXPLORE_SEARCH_TABS: readonly ExploreSearchTab[] = ['all', 'events', 'groups', 'communities'];

export const isExploreSearchTab = (v: unknown): v is ExploreSearchTab =>
  EXPLORE_SEARCH_TABS.includes(v as ExploreSearchTab);

/**
 * Explore with its search open (UX-HOME-01, D11/D12) — where Home's Find actions, its empty states
 * and the legacy `/search` route lead. The same contract as web's `exploreSearchHref`: `tab` picks
 * the result tab, and `q`, when given, is a query already run. With no `q`, a typed tab opens its
 * results for the empty query with the input focused.
 *
 * `at` makes each arrival distinct. Explore is a tab and stays mounted, so a second Find from Home
 * with the very same params would change nothing the screen can see — and the input would not be
 * focused again. Callers pass the time of the tap.
 */
export function exploreSearchHref(tab: ExploreSearchTab, opts: { q?: string; at?: number } = {}): string {
  // Built by hand: React Native's URLSearchParams polyfill does not implement `set`.
  let href = `/(tabs)/explore?search=1&tab=${tab}`;
  if (opts.q !== undefined) href += `&q=${encodeURIComponent(opts.q)}`;
  if (opts.at !== undefined) href += `&at=${opts.at}`;
  return href;
}
