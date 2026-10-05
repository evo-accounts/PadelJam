/** The result tabs of Explore search (UX-EXPL-06). `all` is the default when none is named. */
export type ExploreSearchTab = 'all' | 'events' | 'groups' | 'communities';

/**
 * The link into Explore with its search input focused and one tab pre-selected (UX-HOME-01,
 * D11/D12). The contract matches mobile's `/(tabs)/explore?search=1&tab=…`, so both apps route
 * the Find actions and the empty-state actions the same way.
 */
export function exploreSearchHref(tab: ExploreSearchTab): string {
  return `/app/explore?search=1&tab=${tab}`;
}
