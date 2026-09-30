'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import { ExploreFeed } from '@/components/explore/ExploreFeed';
import { ExploreSearchEntry } from '@/components/explore/ExploreSearchEntry';
import type { ExploreSearchTab } from '@/lib/explore-links';

const TABS: readonly ExploreSearchTab[] = ['all', 'events', 'groups', 'communities'];

/**
 * Explore (UX-EXPL-01): a large left-aligned title with no header actions, the app's one search
 * input under it, and the recommendation feed below.
 *
 * `?search=1&tab=…` (Home's Find actions and empty states, D11/D12) arrives with the input focused
 * and search mode on; the tab is kept for the result tabs W3 brings. Until then search mode is an
 * entry only: the feed gives way, and Cancel brings it back.
 */
function ExploreScreen() {
  const { t } = useT('explore');
  const router = useRouter();
  const params = useSearchParams();
  const fromLink = params.get('search') === '1';
  const tabParam = params.get('tab');
  const tab: ExploreSearchTab = TABS.includes(tabParam as ExploreSearchTab) ? (tabParam as ExploreSearchTab) : 'all';

  const input = useRef<HTMLInputElement>(null);
  const [searching, setSearching] = useState(fromLink);
  const [query, setQuery] = useState('');

  // Arriving (again) through a Find link focuses the input, which also turns search mode on.
  useEffect(() => {
    if (fromLink) input.current?.focus();
  }, [fromLink, tabParam]);

  const cancel = () => {
    setSearching(false);
    setQuery('');
    input.current?.blur();
    // Drop ?search=1 so a reload or Back does not reopen search mode.
    if (fromLink) router.replace('/app/explore', { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-4 pt-6 pb-16 sm:px-6">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <ExploreSearchEntry
        ref={input}
        active={searching}
        value={query}
        onChange={setQuery}
        onActivate={() => setSearching(true)}
        onCancel={cancel}
      />
      {searching ? (
        <p className="text-sm text-muted-foreground" data-testid="explore-search-mode" data-tab={tab}>
          {t('searchSoon')}
        </p>
      ) : (
        <ExploreFeed />
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreScreen />
    </Suspense>
  );
}
