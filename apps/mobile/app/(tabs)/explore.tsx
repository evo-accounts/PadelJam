/**
 * Explore — the recommendation feed and the one place to search (UX-EXPL-01..03).
 *
 * A `top` title with no actions (no search icon here or anywhere, which reverses UX-GLOB-08), a
 * full-width search input under it, and below that the feed: Players, Events, Communities and
 * Groups, each a rail of vertical cards with a See all. No chip bar and no FAB — tabs belong to
 * search, and creating an event is Home's (D11).
 *
 * Search mode is driven by the route: `?search=1&tab=events|groups|communities` is how Home's Find
 * actions and empty states arrive (D11), with the input focused and the tab chosen. Tapping the
 * input sets the same param and Cancel clears it, so a second Find from Home re-enters search
 * even though the tab screen stayed mounted. What search mode shows is an M1 stop-gap — the
 * existing client-side list for one kind — which M2 replaces with the real search states.
 */
import {
  useExploreCommunities,
  useExploreEvents,
  useExploreGroups,
  useExplorePlayers,
} from '@padel/api';
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
import { ExploreList, SEARCH_KINDS, type ExploreKind } from '@/components/explore/ExploreList';
import { ExploreSearchBar } from '@/components/explore/ExploreSearchBar';
import { PlayerCard } from '@/components/explore/PlayerCard';
import { SuggestionRail } from '@/components/explore/SuggestionRail';
import { GroupCard } from '@/components/group/GroupCard';
import { Chip, TopBar } from '@/components/ui';
import { colors, space } from '../../theme';

type SearchKind = (typeof SEARCH_KINDS)[number];
const isSearchKind = (v: unknown): v is SearchKind => SEARCH_KINDS.includes(v as SearchKind);

export default function ExploreScreen() {
  const { t } = useT('discovery');
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string; tab?: string; q?: string }>();
  const input = useRef<TextInput>(null);
  const [query, setQuery] = useState(params.q ?? '');

  const active = params.search === '1';
  // The param picks the tab; a chip overrides it until the param itself changes, so a later
  // "Find Group" from Home still lands on Groups rather than on whatever chip was last tapped.
  // `all` (web's default, and M2's) has no list of its own yet: it reads as Events.
  const [picked, setPicked] = useState<{ from: string | undefined; kind: SearchKind } | null>(null);
  const fromParam: SearchKind = isSearchKind(params.tab) ? params.tab : 'events';
  const kind = picked && picked.from === params.tab ? picked.kind : fromParam;

  // Arriving with ?search=1 focuses the input. A nudge after mount rather than `autoFocus`: the
  // input exists before the tab switch finishes, and a focus fired mid-transition is dropped.
  useEffect(() => {
    if (params.search !== '1') return;
    const id = setTimeout(() => input.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [params.search, params.tab]);

  const activate = () => router.setParams({ search: '1' });
  const cancel = () => {
    input.current?.blur();
    setQuery('');
    setPicked(null);
    router.setParams({ search: '0', q: '' });
  };

  return (
    <ExploreActionsProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar variant="top" title={t('title')} />
        <ExploreSearchBar
          ref={input}
          value={query}
          onChangeText={setQuery}
          active={active}
          onActivate={activate}
          onCancel={cancel}
        />
        {active ? (
          <SearchState
            kind={kind}
            query={query}
            onPick={(k) => setPicked({ from: params.tab, kind: k })}
          />
        ) : (
          <Feed />
        )}
      </SafeAreaView>
    </ExploreActionsProvider>
  );
}

/** M1's search mode: one kind at a time, filtered client-side. M2 replaces this body. */
function SearchState({
  kind,
  query,
  onPick,
}: {
  kind: ExploreKind;
  query: string;
  onPick: (k: SearchKind) => void;
}) {
  const { t } = useT('discovery');
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
        style={styles.chipsWrap}
      >
        {SEARCH_KINDS.map((k) => (
          <Chip
            key={k}
            label={t(`tab_${k}`)}
            selected={kind === k}
            onPress={() => onPick(k)}
            testID={`explore-search-tab-${k}`}
          />
        ))}
      </ScrollView>
      <ExploreList kind={kind} query={query} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" />
    </>
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
  chipsWrap: { flexGrow: 0 },
  chips: { flexDirection: 'row', gap: space[2], paddingHorizontal: space[4], paddingBottom: space[3] },
  // The tab bar is not absolute (screens stop above it), so this only has to clear the last rail's
  // shadow and leave breathing room — there is no FAB to clear any more (UX-EXPL-02).
  content: { paddingTop: space[2], gap: space[2], paddingBottom: space[10] },
});
