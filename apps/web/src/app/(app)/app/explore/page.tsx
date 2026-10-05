'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@padel/auth';
import type { ForYouTerm } from '@padel/api';
import { useT } from '@padel/i18n';
import { ExploreFeed } from '@/components/explore/ExploreFeed';
import { ExploreSearchEntry } from '@/components/explore/ExploreSearchEntry';
import { SearchResults } from '@/components/explore/search/SearchResults';
import { SearchStart } from '@/components/explore/search/SearchStart';
import { SearchSuggestions } from '@/components/explore/search/SearchSuggestions';
import {
  EMPTY_EVENTS_FILTERS,
  EMPTY_SEARCH_FILTERS,
  typesForFormat,
  type SearchFilterState,
} from '@padel/api';
import type { ExploreSearchTab } from '@/lib/explore-links';
import { useRecentSearches } from '@/lib/recent-searches';

const TABS: readonly ExploreSearchTab[] = ['all', 'events', 'groups', 'communities'];

/** The typeahead waits this long after the last keystroke (D7). */
const SUGGEST_DEBOUNCE_MS = 150;

function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return out;
}

/** `/app/explore?search=1[&q=…][&tab=…]` — the search state that survives reload and Back. */
function searchHref(q: string | null, tab: ExploreSearchTab): string {
  const p = new URLSearchParams({ search: '1' });
  if (q !== null) p.set('q', q);
  if (tab !== 'all') p.set('tab', tab);
  return `/app/explore?${p.toString()}`;
}

/**
 * Search state changes go through the History API, which Next's router keeps `useSearchParams` in
 * sync with. Unlike `router.push` there is no server round trip, so the URL (and so the screen)
 * updates at once and a tab switch can never race an in-flight query change.
 */
const pushUrl = (href: string) => window.history.pushState(null, '', href);
const replaceUrl = (href: string) => window.history.replaceState(null, '', href);

/**
 * Explore (UX-EXPL-01) and its search (UX-EXPL-04..08).
 *
 * The URL holds what a reload or Back must restore: `search=1` (search mode), `q` (the query that
 * was run — present, even empty, means results are showing) and `tab`. What is typed but not yet
 * run, and each tab's filters (D13), are screen state.
 *
 *   feed         no `search`
 *   start        search mode, nothing typed: For you + Recent searches (EXPL-04)
 *   suggestions  something typed, not run (EXPL-05)
 *   results      a query run: the tab bar, All or a typed tab (EXPL-06/07)
 *
 * Home's Find links arrive as `?search=1&tab=events|groups|communities` with no `q`: they open that
 * tab's results for an empty query — everything, ready to filter — with the input focused.
 */
function ExploreScreen() {
  const { t } = useT('explore');
  const params = useSearchParams();
  const uid = useSession().session?.user.id;
  const { recents, add: addRecent, remove: removeRecent, clear: clearRecents } = useRecentSearches(uid);

  const searching = params.get('search') === '1';
  const tabParam = params.get('tab');
  const tab: ExploreSearchTab = TABS.includes(tabParam as ExploreSearchTab) ? (tabParam as ExploreSearchTab) : 'all';
  const qParam = params.get('q');
  /** The query that was run; a Find link to a typed tab runs the empty query. */
  const ran = qParam ?? (searching && tab !== 'all' ? '' : null);

  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(ran ?? '');
  /** True once the input is edited (or Back is pressed) after a run: suggestions replace results. */
  const [editing, setEditing] = useState(false);
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_SEARCH_FILTERS);
  const suggestText = useDebounced(draft, SUGGEST_DEBOUNCE_MS);

  // A new run — ours, or Back/Forward through history — puts its query in the input. Adjusted
  // while rendering rather than in an effect, so the input never shows the stale text for a frame.
  const [shownRan, setShownRan] = useState(ran);
  if (ran !== shownRan) {
    setShownRan(ran);
    setDraft(ran ?? '');
    setEditing(false);
  }

  // Arriving through a Find link focuses the input.
  useEffect(() => {
    if (searching && qParam === null) input.current?.focus();
    // Only on arrival with that link, not on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, tabParam]);

  const run = (q: string, nextTab: ExploreSearchTab = tab) => {
    const text = q.trim();
    if (text) addRecent(text);
    setDraft(text);
    setEditing(false);
    input.current?.blur();
    pushUrl(searchHref(text, nextTab));
  };

  const runTerm = (term: ForYouTerm) => {
    if (term.kind === 'format') {
      // A format chip is a filter, not text: the Events tab, every specification of that type.
      setFilters((f) => ({ ...f, events: { ...EMPTY_EVENTS_FILTERS, types: typesForFormat(term.value) } }));
      setDraft('');
      setEditing(false);
      input.current?.blur();
      pushUrl(searchHref('', 'events'));
    } else {
      run(term.value);
    }
  };

  const activate = () => {
    if (!searching) pushUrl(searchHref(null, 'all'));
  };

  const cancel = () => {
    setDraft('');
    setEditing(false);
    setFilters(EMPTY_SEARCH_FILTERS);
    input.current?.blur();
    replaceUrl('/app/explore');
  };

  const back = () => {
    setEditing(true);
    input.current?.focus();
  };

  const mode: 'feed' | 'start' | 'suggestions' | 'results' = !searching
    ? 'feed'
    : ran !== null && !editing
      ? 'results'
      : draft.trim()
        ? 'suggestions'
        : 'start';

  return (
    <div className="flex min-w-0 flex-col gap-6 px-4 pt-6 pb-16 sm:px-6">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <ExploreSearchEntry
        ref={input}
        active={searching}
        value={draft}
        onChange={(v) => {
          setDraft(v);
          setEditing(true);
        }}
        onActivate={activate}
        onCancel={cancel}
        onSubmit={() => {
          if (draft.trim()) run(draft);
        }}
        onBack={mode === 'results' ? back : undefined}
      />
      <div className="min-w-0" data-testid="explore-search-mode" data-mode={mode} data-tab={tab}>
        {mode === 'feed' ? (
          <ExploreFeed />
        ) : mode === 'start' ? (
          <SearchStart
            recents={recents}
            onRunTerm={runTerm}
            onRunQuery={(q) => run(q)}
            onRemoveRecent={removeRecent}
            onClearRecents={clearRecents}
          />
        ) : mode === 'suggestions' ? (
          <SearchSuggestions typed={draft} debounced={suggestText} onRun={(q) => run(q)} />
        ) : (
          <SearchResults
            q={ran ?? ''}
            tab={tab}
            onTab={(next) => replaceUrl(searchHref(ran ?? '', next))}
            filters={filters}
            onFilters={setFilters}
          />
        )}
      </div>
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
