/**
 * Explore — the recommendation feed and the one place to search (UX-EXPL-01..06).
 *
 * A `top` title with no actions (no search icon here or anywhere, which reverses UX-GLOB-08), a
 * full-width search input under it, and below that the feed: Players, Events, Communities and
 * Groups, each a rail of vertical cards with a See all. No chip bar and no FAB — tabs belong to
 * search results, and creating an event is Home's (D11).
 *
 * Search is a small state machine, the same as web's Explore page:
 *
 *   feed         not searching
 *   start        searching, nothing typed: For you chips + Recent searches (EXPL-04)
 *   suggestions  something typed, not run yet: typeahead rows (EXPL-05)
 *   results      a query run: the tab bar, All or a typed tab (EXPL-06/07)
 *
 * Focusing the input enters search (start); Cancel leaves it from any state. Typing after a run
 * returns to suggestions, and so does the back arrow left of the input. The typed text is shared
 * by every tab; each typed tab keeps its own filters (D13).
 *
 * The route is how other screens ARRIVE: `?search=1&tab=…[&q=…]&at=…` (see `exploreSearchHref`).
 * Home's Find actions carry no `q` and open that tab's results for the empty query — everything,
 * ready to narrow — with the input focused. `at` makes each arrival distinct, because this tab
 * stays mounted and a repeated Find would otherwise change nothing (M1 left the input unfocused on
 * a second Find to the same tab). After arrival the state is the screen's own.
 */
import {
  useExploreCommunities,
  useExploreEvents,
  useExploreGroups,
  useExplorePlayers,
  type ForYouTerm,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event/EventCard';
import { CommunityCard } from '@/components/explore/CommunityCard';
import {
  CommunityJoinAction,
  ExploreActionsProvider,
  GroupJoinAction,
  PlayerFollowAction,
  useStickyRows,
} from '@/components/explore/ExploreActions';
import { ExploreSearchBar } from '@/components/explore/ExploreSearchBar';
import { PlayerCard } from '@/components/explore/PlayerCard';
import { SearchResults } from '@/components/explore/search/SearchResults';
import { SearchStart } from '@/components/explore/search/SearchStart';
import { SearchSuggestions } from '@/components/explore/search/SearchSuggestions';
import {
  EMPTY_EVENTS_FILTERS,
  EMPTY_SEARCH_FILTERS,
  typesForFormat,
  type SearchFilterState,
} from '@/components/explore/search/searchFilters';
import { SuggestionRail } from '@/components/explore/SuggestionRail';
import { GroupCard } from '@/components/group/GroupCard';
import { TopBar } from '@/components/ui';
import { isExploreSearchTab, type ExploreSearchTab } from '@/lib/exploreLinks';
import { useRecentSearches } from '@/lib/recentSearches';
import { useDebounced } from '@/lib/useDebounced';
import { colors, space } from '../../theme';

/** The typeahead waits this long after the last keystroke (D7). */
const SUGGEST_DEBOUNCE_MS = 150;

type Mode = 'feed' | 'start' | 'suggestions' | 'results';

export default function ExploreScreen() {
  const { t } = useT('discovery');
  const params = useLocalSearchParams<{ search?: string; tab?: string; q?: string; at?: string }>();
  const uid = useSession().session?.user.id;
  const { recents, add: addRecent, remove: removeRecent, clear: clearRecents } = useRecentSearches(uid);
  const input = useRef<TextInput>(null);

  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<ExploreSearchTab>('all');
  /** The query that was run; null until one is. */
  const [ran, setRan] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  /** True once the input is edited (or Back is pressed) after a run: suggestions replace results. */
  const [editing, setEditing] = useState(false);
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_SEARCH_FILTERS);
  const suggestText = useDebounced(draft, SUGGEST_DEBOUNCE_MS);

  // An arrival through the route (Home's Find, the /search redirect). Adjusted while rendering
  // rather than in an effect, so the first frame already shows the arrived-at state.
  const arrival =
    params.search === '1' ? [params.tab, params.q === undefined ? '-' : `q:${params.q}`, params.at].join('|') : null;
  const [seenArrival, setSeenArrival] = useState<string | null>(null);
  if (arrival !== null && arrival !== seenArrival) {
    setSeenArrival(arrival);
    const nextTab: ExploreSearchTab = isExploreSearchTab(params.tab) ? params.tab : 'all';
    const nextRan = params.q ?? (nextTab !== 'all' ? '' : null);
    setSearching(true);
    setTab(nextTab);
    setRan(nextRan);
    setDraft(nextRan ?? '');
    setEditing(false);
    setFilters(EMPTY_SEARCH_FILTERS);
  }

  // Arriving without a query focuses the input. A nudge after mount rather than `autoFocus`: the
  // input exists before the tab switch finishes, and a focus fired mid-transition is dropped.
  const focusOnArrival = arrival !== null && params.q === undefined;
  useEffect(() => {
    if (!focusOnArrival) return;
    const id = setTimeout(() => input.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [arrival, focusOnArrival]);

  const run = (q: string) => {
    const text = q.trim();
    if (text) addRecent(text);
    setDraft(text);
    setRan(text);
    setEditing(false);
    input.current?.blur();
  };

  const runTerm = (term: ForYouTerm) => {
    if (term.kind === 'format') {
      // A format chip is a filter, not text: the Events tab, every specification of that type.
      setFilters((f) => ({ ...f, events: { ...EMPTY_EVENTS_FILTERS, types: typesForFormat(term.value) } }));
      setTab('events');
      setDraft('');
      setRan('');
      setEditing(false);
      input.current?.blur();
    } else {
      run(term.value);
    }
  };

  const activate = () => {
    setSearching(true);
    setTab('all');
    setRan(null);
    setDraft('');
    setEditing(false);
  };

  const cancel = () => {
    input.current?.blur();
    setSearching(false);
    setRan(null);
    setDraft('');
    setEditing(false);
    setFilters(EMPTY_SEARCH_FILTERS);
  };

  const back = () => {
    setEditing(true);
    input.current?.focus();
  };

  const mode: Mode = !searching
    ? 'feed'
    : ran !== null && !editing
      ? 'results'
      : draft.trim()
        ? 'suggestions'
        : 'start';

  return (
    <ExploreActionsProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar variant="top" title={t('title')} />
        <ExploreSearchBar
          ref={input}
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            setEditing(true);
          }}
          active={searching}
          onActivate={activate}
          onCancel={cancel}
          onSubmit={() => {
            if (draft.trim()) run(draft);
          }}
          onBack={mode === 'results' ? back : undefined}
        />
        {mode === 'feed' ? (
          <Feed />
        ) : mode === 'start' ? (
          <SearchStart
            recents={recents}
            onRunTerm={runTerm}
            onRunQuery={run}
            onRemoveRecent={removeRecent}
            onClearRecents={clearRecents}
          />
        ) : mode === 'suggestions' ? (
          <SearchSuggestions typed={draft} debounced={suggestText} onRun={run} />
        ) : (
          <SearchResults q={ran ?? ''} tab={tab} onTab={setTab} filters={filters} onFilters={setFilters} />
        )}
      </SafeAreaView>
    </ExploreActionsProvider>
  );
}

function Feed() {
  const { t } = useT('discovery');
  const router = useRouter();

  const players = useExplorePlayers();
  const events = useExploreEvents();
  const communities = useExploreCommunities();
  const groups = useExploreGroups();

  // A card the viewer just followed or joined stays put until they leave the screen, even though
  // the refetch its action triggers no longer returns it (see stickyRows.ts).
  const playerRows = useStickyRows('players', players.data ?? []);
  const communityRows = useStickyRows('communities', communities.data ?? []);
  const groupRows = useStickyRows('groups', groups.data ?? []);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Players, Communities and Groups are hidden when there is nothing to recommend (D10). */}
      <SuggestionRail
        title={t('railPlayers')}
        seeAllLabel={t('seeAll')}
        onSeeAll={() => router.push('/explore/players')}
        seeAllTestID="explore-see-all-players"
        data={playerRows}
        isLoading={players.isLoading}
        isError={players.isError}
        hideWhenEmpty
        emptyLabel={t('emptyPlayers')}
        errorLabel={t('loadError')}
        keyExtractor={(p) => p.id}
        renderItem={(p, index) => (
          <PlayerCard
            player={p}
            orientation="vertical"
            onPress={() => router.push(`/profile/${p.id}`)}
            action={<PlayerFollowAction player={p} index={index} />}
          />
        )}
        onRetry={() => players.refetch()}
        testID="empty-rail-players"
      />
      {/* Events keeps its empty state: with the FAB gone, Create event is its real next step. */}
      <SuggestionRail
        title={t('railEvents')}
        seeAllLabel={t('seeAll')}
        onSeeAll={() => router.push('/explore/events')}
        seeAllTestID="explore-see-all-events"
        data={events.data ?? []}
        isLoading={events.isLoading}
        isError={events.isError}
        emptyLabel={t('emptyEvents')}
        emptyAction={{
          label: t('createEventCta'),
          onPress: () => router.push('/event/create' as Href),
          testID: 'explore-events-create',
        }}
        errorLabel={t('loadError')}
        keyExtractor={(e) => e.id}
        renderItem={(e) => (
          <EventCard event={e} orientation="vertical" onPress={() => router.push(`/event/${e.id}`)} />
        )}
        onRetry={() => events.refetch()}
        testID="empty-rail-events"
      />
      <SuggestionRail
        title={t('railCommunities')}
        seeAllLabel={t('seeAll')}
        onSeeAll={() => router.push('/explore/communities')}
        seeAllTestID="explore-see-all-communities"
        data={communityRows}
        isLoading={communities.isLoading}
        isError={communities.isError}
        hideWhenEmpty
        emptyLabel={t('emptyCommunities')}
        errorLabel={t('loadError')}
        keyExtractor={(c) => c.id}
        renderItem={(c, index) => (
          <CommunityCard
            community={c}
            orientation="vertical"
            onOpen={() => router.push(`/community/${c.id}`)}
            action={<CommunityJoinAction community={c} index={index} />}
          />
        )}
        onRetry={() => communities.refetch()}
        testID="empty-rail-communities"
      />
      <SuggestionRail
        title={t('railGroups')}
        seeAllLabel={t('seeAll')}
        onSeeAll={() => router.push('/explore/groups')}
        seeAllTestID="explore-see-all-groups"
        data={groupRows}
        isLoading={groups.isLoading}
        isError={groups.isError}
        hideWhenEmpty
        emptyLabel={t('emptyGroups')}
        errorLabel={t('loadError')}
        keyExtractor={(g) => g.id}
        renderItem={(g, index) => (
          <GroupCard
            group={g}
            orientation="vertical"
            onPress={() => router.push(`/group/${g.id}`)}
            action={<GroupJoinAction group={g} index={index} />}
          />
        )}
        onRetry={() => groups.refetch()}
        testID="empty-rail-groups"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // The tab bar is not absolute (screens stop above it), so this only has to clear the last rail's
  // shadow and leave breathing room — there is no FAB to clear any more (UX-EXPL-02).
  content: { paddingTop: space[2], gap: space[2], paddingBottom: space[10] },
});
