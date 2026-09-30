import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';

import { exploreSearchHref, isExploreSearchTab } from '@/lib/exploreLinks';

/**
 * `/search` is no longer a screen (D12): search lives inline on Explore (UX-EXPL-01..06). The
 * route stays as a redirect so old links and in-flight builds land in the right place.
 *
 * The legacy chip strip had `foryou` and `players`, which have no result tab now — players appear
 * only in All — so those, and anything unknown, open All. `q` carries over as a query already run.
 */
export default function SearchRedirect() {
  const { tab, q } = useLocalSearchParams<{ tab?: string; q?: string }>();
  // Stamped once per mount, so the redirect is stable across re-renders but each visit is a new
  // arrival on the (always-mounted) Explore tab.
  const [at] = useState(() => Date.now());
  const href = exploreSearchHref(isExploreSearchTab(tab) ? tab : 'all', { q: q || undefined, at });
  return <Redirect href={href as Href} />;
}
