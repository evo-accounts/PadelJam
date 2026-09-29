/** The result tabs of Explore search (UX-EXPL-06). `all` is the default when none is named. */
export type ExploreSearchTab = 'all' | 'events' | 'groups' | 'communities';

/**
 * Explore with its search input focused and one tab pre-selected (UX-HOME-01, D11/D12) — where
 * Home's Find actions and its empty states lead. The same contract as web's `exploreSearchHref`,
 * so both apps route the Find actions alike.
 */
export function exploreSearchHref(tab: ExploreSearchTab): string {
  return `/(tabs)/explore?search=1&tab=${tab}`;
}
