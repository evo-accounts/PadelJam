/**
 * Search results (UX-EXPL-06, UX-EXPL-07): the tab bar All / Events / Groups / Communities exists
 * only here — never on the feed, never on the empty query. Only the active tab's queries run.
 *
 * - All is a mixed overview: Players, Events, Communities, Groups, each a titled row of vertical
 *   cards, shown only when it has something. Players appear nowhere else (there is no Players
 *   tab). No filter control.
 * - Events, Groups and Communities are full-width lists of horizontal cards with their inline
 *   actions, paged from the server as the end scrolls into view.
 *
 * Every list keeps the keyboard in mind: a Find link arrives here with the input focused, so rows
 * must scroll clear of the keyboard, and the first tap on one must reach it rather than be spent
 * dismissing the keyboard (see the keyboard-reachability notes in the E2E README).
 */
import {
  useSearchCommunities,
  useSearchEvents,
  useSearchGroups,
  useSearchPlayers,
  type SearchEvent,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EventCard } from '@/components/event/EventCard';
import { CommunityCard } from '@/components/explore/CommunityCard';
import { CommunityJoinAction, GroupJoinAction, PlayerFollowAction } from '@/components/explore/ExploreActions';
import { PlayerCard } from '@/components/explore/PlayerCard';
import { SuggestionRail } from '@/components/explore/SuggestionRail';
import { GroupCard } from '@/components/group/GroupCard';
import { EmptyState, emptyIcon, listEmptyContent, Text } from '@/components/ui';
import type { ExploreSearchTab } from '@/lib/exploreLinks';
import { EXPLORE_SEARCH_TABS } from '@/lib/exploreLinks';
import { colors, space } from '../../../theme';
import {
  toCommunityFilters,
  toEventFilters,
  toGroupFilters,
  type SearchFilterState,
} from './searchFilters';

const TAB_LABEL = {
  all: 'tabAll',
  events: 'tab_events',
  groups: 'tab_groups',
  communities: 'tab_communities',
} as const;

/** EventCard labels a spot the viewer does not hold yet; the other states need no badge. */
const eventViewerStatus = (e: SearchEvent) =>
  e.viewer_state === 'waiting_list' || e.viewer_state === 'interested' ? e.viewer_state : undefined;

/** The props every result list shares so the keyboard never hides or eats a row. */
const KEYBOARD_SAFE = {
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: 'on-drag',
  automaticallyAdjustKeyboardInsets: true,
} as const;

export function SearchResults({
  q,
  tab,
  onTab,
  filters,
}: {
  q: string;
  tab: ExploreSearchTab;
  onTab: (tab: ExploreSearchTab) => void;
  /** One set per typed tab (D13), held by the screen so a tab's filters survive switching away. */
  filters: SearchFilterState;
}) {
  return (
    <View style={styles.flex}>
      <SearchTabBar tab={tab} onTab={onTab} />
      {tab === 'all' ? (
        <AllTab q={q} onTab={onTab} />
      ) : tab === 'events' ? (
        <EventsTab q={q} filters={filters} />
      ) : tab === 'groups' ? (
        <GroupsTab q={q} filters={filters} />
      ) : (
        <CommunitiesTab q={q} filters={filters} />
      )}
    </View>
  );
}

function SearchTabBar({ tab, onTab }: { tab: ExploreSearchTab; onTab: (tab: ExploreSearchTab) => void }) {
  const { t } = useT('discovery');
  return (
    <View style={styles.tabBar}>
      {EXPLORE_SEARCH_TABS.map((value) => {
        const selected = value === tab;
        return (
          <Pressable
            key={value}
            onPress={() => onTab(value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.tab, selected && styles.tabSelected]}
            testID={`explore-results-tab-${value}`}
          >
            <Text variant="label" tone={selected ? 'default' : 'muted'}>
              {t(TAB_LABEL[value])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- All ---

type Section = { isLoading: boolean; isError: boolean; data?: { items: unknown[] }; refetch: () => unknown };

function AllTab({ q, onTab }: { q: string; onTab: (tab: ExploreSearchTab) => void }) {
  const { t } = useT('discovery');
  const router = useRouter();
  const players = useSearchPlayers(q);
  const events = useSearchEvents(q);
  const communities = useSearchCommunities(q);
  const groups = useSearchGroups(q);
  const all: Section[] = [players, events, communities, groups];
  const text = q.trim();

  if (all.every((x) => x.isError && !x.data)) {
    return (
      <EmptyState
        fill
        tone="error"
        title={t('searchError')}
        action={{ label: t('retry', { ns: 'common' }), onPress: () => all.forEach((x) => void x.refetch()) }}
        testID="explore-all-error"
      />
    );
  }
  if (all.every((x) => !x.isLoading && !x.isError && (x.data?.items.length ?? 0) === 0)) {
    return (
      <EmptyState
        fill
        icon={emptyIcon('magnifyingglass')}
        title={text ? t('noResultsFor', { q: text }) : t('noResults')}
        body={t('noResultsBody')}
        testID="explore-all-empty"
      />
    );
  }

  const rail = {
    hideWhenEmpty: true,
    errorLabel: t('searchError'),
    emptyLabel: t('noResults'),
    seeAllLabel: t('seeAll'),
  } as const;

  return (
    <ScrollView contentContainerStyle={styles.allContent} {...KEYBOARD_SAFE}>
      <SuggestionRail
        {...rail}
        title={t('sectionPlayers')}
        data={players.data?.items ?? []}
        isLoading={players.isLoading}
        isError={players.isError}
        onRetry={() => void players.refetch()}
        keyExtractor={(p) => p.id}
        renderItem={(p, index) => (
          <PlayerCard
            player={p}
            orientation="vertical"
            onPress={() => router.push(`/profile/${p.id}`)}
            action={<PlayerFollowAction player={p} index={index} />}
          />
        )}
        testID="explore-all-players"
      />
      <SuggestionRail
        {...rail}
        title={t('sectionEvents')}
        onSeeAll={() => onTab('events')}
        seeAllTestID="explore-all-events-see-all"
        data={events.data?.items ?? []}
        isLoading={events.isLoading}
        isError={events.isError}
        onRetry={() => void events.refetch()}
        keyExtractor={(e) => e.id}
        renderItem={(e) => (
          <EventCard
            event={e}
            orientation="vertical"
            viewerStatus={eventViewerStatus(e)}
            onPress={() => router.push(`/event/${e.id}`)}
          />
        )}
        testID="explore-all-events"
      />
      <SuggestionRail
        {...rail}
        title={t('sectionCommunities')}
        onSeeAll={() => onTab('communities')}
        seeAllTestID="explore-all-communities-see-all"
        data={communities.data?.items ?? []}
        isLoading={communities.isLoading}
        isError={communities.isError}
        onRetry={() => void communities.refetch()}
        keyExtractor={(c) => c.id}
        renderItem={(c, index) => (
          <CommunityCard
            community={c}
            orientation="vertical"
            onOpen={() => router.push(`/community/${c.id}`)}
            action={<CommunityJoinAction community={c} index={index} />}
          />
        )}
        testID="explore-all-communities"
      />
      <SuggestionRail
        {...rail}
        title={t('sectionGroups')}
        onSeeAll={() => onTab('groups')}
        seeAllTestID="explore-all-groups-see-all"
        data={groups.data?.items ?? []}
        isLoading={groups.isLoading}
        isError={groups.isError}
        onRetry={() => void groups.refetch()}
        keyExtractor={(g) => g.id}
        renderItem={(g, index) => (
          <GroupCard
            group={g}
            orientation="vertical"
            onPress={() => router.push(`/group/${g.id}`)}
            action={<GroupJoinAction group={g} index={index} />}
          />
        )}
        testID="explore-all-groups"
      />
    </ScrollView>
  );
}

// --- Typed tabs ---

/** The slice of a paged search hook a typed list reads. */
type Paged<T> = {
  data?: { items: T[]; totalCount: number };
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
};

function TypedList<T extends { id: string }>({
  query,
  renderRow,
  empty,
  testID,
}: {
  query: Paged<T>;
  renderRow: (row: T, index: number) => ReactElement;
  empty: ReactElement;
  testID: string;
}) {
  const { t } = useT('discovery');
  if (query.isLoading) return <ActivityIndicator color={colors.foreground} style={styles.state} />;

  // A refetch after an action can shift a row from one page into the next; list it once.
  const seen = new Set<string>();
  const rows = (query.data?.items ?? []).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

  return (
    <FlashList
      data={rows}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ ...styles.list, ...listEmptyContent }}
      {...KEYBOARD_SAFE}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item, index }) => renderRow(item, index)}
      ListEmptyComponent={
        query.isError ? (
          <EmptyState
            fill
            tone="error"
            title={t('searchError')}
            action={{ label: t('retry', { ns: 'common' }), onPress: () => void query.refetch() }}
            testID={`${testID}-error`}
          />
        ) : (
          empty
        )
      }
      ListFooterComponent={
        query.isFetchingNextPage ? <ActivityIndicator color={colors.foreground} style={styles.state} /> : null
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      testID={testID}
    />
  );
}

function TypedEmpty({ q, kind, testID }: { q: string; kind: 'Events' | 'Groups' | 'Communities'; testID: string }) {
  const { t } = useT('discovery');
  const text = q.trim();
  return (
    <EmptyState
      fill
      icon={emptyIcon('magnifyingglass')}
      title={text ? t(`noResults${kind}For`, { q: text }) : t(`noResults${kind}`)}
      body={t('noResultsBody')}
      testID={testID}
    />
  );
}

function EventsTab({ q, filters }: { q: string; filters: SearchFilterState }) {
  const router = useRouter();
  const query = useSearchEvents(q, toEventFilters(filters.events), filters.events.sort);
  return (
    <TypedList
      query={query}
      testID="explore-events-list"
      renderRow={(e) => (
        <EventCard event={e} viewerStatus={eventViewerStatus(e)} onPress={() => router.push(`/event/${e.id}`)} />
      )}
      empty={<TypedEmpty q={q} kind="Events" testID="explore-events-empty" />}
    />
  );
}

function GroupsTab({ q, filters }: { q: string; filters: SearchFilterState }) {
  const router = useRouter();
  const query = useSearchGroups(q, toGroupFilters(filters.groups), filters.groups.sort);
  return (
    <TypedList
      query={query}
      testID="explore-groups-list"
      renderRow={(g, index) => (
        <GroupCard
          group={g}
          orientation="horizontal"
          onPress={() => router.push(`/group/${g.id}`)}
          action={<GroupJoinAction group={g} index={index} />}
        />
      )}
      empty={<TypedEmpty q={q} kind="Groups" testID="explore-groups-empty" />}
    />
  );
}

function CommunitiesTab({ q, filters }: { q: string; filters: SearchFilterState }) {
  const router = useRouter();
  const query = useSearchCommunities(q, toCommunityFilters(filters.communities), filters.communities.sort);
  return (
    <TypedList
      query={query}
      testID="explore-communities-list"
      renderRow={(c, index) => (
        <CommunityCard
          community={c}
          orientation="horizontal"
          onOpen={() => router.push(`/community/${c.id}`)}
          action={<CommunityJoinAction community={c} index={index} />}
        />
      )}
      empty={<TypedEmpty q={q} kind="Communities" testID="explore-communities-empty" />}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space[3],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: { borderBottomColor: colors.primary },
  allContent: { paddingTop: space[2], gap: space[2], paddingBottom: space[10] },
  list: { padding: space[4] },
  separator: { height: space[3] },
  state: { paddingVertical: space[6] },
});
