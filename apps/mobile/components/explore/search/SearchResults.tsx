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
  useCommunities,
  useSearchCommunities,
  useSearchEvents,
  useSearchGroups,
  useSearchPlayers,
  type SearchEvent,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
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
import { FilterSheet } from './FilterSheet';
import { ResultsHeader, type AppliedChip } from './ResultsHeader';
import {
  COMMUNITY_TYPE_LABEL,
  EMPTY_COMMUNITIES_FILTERS,
  EMPTY_EVENTS_FILTERS,
  EMPTY_GROUPS_FILTERS,
  EVENT_TYPE_LABEL,
  localDay,
  PRIVACY_LABEL,
  SORT_LABEL,
  toCommunityFilters,
  toEventFilters,
  toGroupFilters,
  toggle,
  type CommunitiesFilterState,
  type EventsFilterState,
  type GroupsFilterState,
  type SearchFilterState,
} from './searchFilters';
import { useViewerHasLocation } from './useViewerHasLocation';

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
  onFilters,
}: {
  q: string;
  tab: ExploreSearchTab;
  onTab: (tab: ExploreSearchTab) => void;
  /**
   * One set per typed tab (D13), held by the screen: switching tab carries nothing across, and
   * coming back restores that tab's filters and chips.
   */
  filters: SearchFilterState;
  onFilters: (next: SearchFilterState) => void;
}) {
  return (
    <View style={styles.flex}>
      <SearchTabBar tab={tab} onTab={onTab} />
      {tab === 'all' ? (
        <AllTab q={q} onTab={onTab} />
      ) : tab === 'events' ? (
        <EventsTab q={q} state={filters.events} onState={(events) => onFilters({ ...filters, events })} />
      ) : tab === 'groups' ? (
        <GroupsTab q={q} state={filters.groups} onState={(groups) => onFilters({ ...filters, groups })} />
      ) : (
        <CommunitiesTab
          q={q}
          state={filters.communities}
          onState={(communities) => onFilters({ ...filters, communities })}
        />
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

type Translate = (key: string, options?: Record<string, unknown>) => string;

function sortChip(t: Translate, sort: keyof typeof SORT_LABEL, reset: () => void): AppliedChip[] {
  return sort === 'relevant' ? [] : [{ key: 'sort', label: t('sortChip', { sort: t(SORT_LABEL[sort]) }), onRemove: reset }];
}

function distanceChip(t: Translate, maxKm: number | null, reset: () => void): AppliedChip[] {
  return maxKm == null ? [] : [{ key: 'distance', label: t('distanceUpTo', { km: maxKm }), onRemove: reset }];
}

/** Distance means nothing without the viewer's point (D2): drop it rather than match nothing. */
function withoutDistance<S extends { sort: string; maxKm: number | null }>(state: S, hasLocation: boolean): S {
  return hasLocation ? state : { ...state, maxKm: null, sort: state.sort === 'distance' ? 'relevant' : state.sort };
}

/** The empty state of a typed tab: with filters on, say so and offer to clear them. */
function TypedEmpty({
  q,
  kind,
  filtered,
  onClear,
  testID,
}: {
  q: string;
  kind: 'Events' | 'Groups' | 'Communities';
  filtered: boolean;
  onClear: () => void;
  testID: string;
}) {
  const { t } = useT('discovery');
  const text = q.trim();
  return (
    <EmptyState
      fill
      icon={emptyIcon('magnifyingglass')}
      title={text ? t(`noResults${kind}For`, { q: text }) : t(`noResults${kind}`)}
      body={filtered ? t('noResultsFiltered') : t('noResultsBody')}
      action={filtered ? { label: t('clearFilters'), onPress: onClear, variant: 'secondary', testID: `${testID}-clear` } : undefined}
      testID={testID}
    />
  );
}

/** A typed tab: count and Filter, applied chips, the list, and the sheet while it is open. */
function TypedTab<T extends { id: string }, K extends 'events' | 'groups' | 'communities', S>({
  tab,
  query,
  chips,
  state,
  onState,
  empty,
  hasLocation,
  renderRow,
}: {
  tab: K;
  query: Paged<T>;
  chips: AppliedChip[];
  state: S;
  onState: (s: S) => void;
  empty: ReactElement;
  hasLocation: boolean;
  renderRow: (row: T, index: number) => ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.flex}>
      <ResultsHeader
        count={query.data?.totalCount ?? 0}
        loading={query.isLoading}
        onFilter={() => setOpen(true)}
        chips={chips}
        testID={`explore-${tab}-results`}
      />
      <TypedList query={query} testID={`explore-${tab}-list`} renderRow={renderRow} empty={empty} />
      {open ? (
        <FilterSheet
          tab={tab}
          value={state as never}
          hasLocation={hasLocation}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            onState(next as S);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

function EventsTab({ q, state, onState }: { q: string; state: EventsFilterState; onState: (s: EventsFilterState) => void }) {
  const { t, i18n } = useT('discovery');
  const router = useRouter();
  const { hasLocation } = useViewerHasLocation();
  const effective = withoutDistance(state, hasLocation);
  const query = useSearchEvents(q, toEventFilters(effective), effective.sort);
  const day = (d: string) => localDay(d).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });

  const chips: AppliedChip[] = [
    ...sortChip(t, effective.sort, () => onState({ ...state, sort: 'relevant' })),
    ...(state.dateFrom
      ? [{ key: 'from', label: t('chipFrom', { date: day(state.dateFrom) }), onRemove: () => onState({ ...state, dateFrom: '' }) }]
      : []),
    ...(state.dateTo
      ? [{ key: 'to', label: t('chipTo', { date: day(state.dateTo) }), onRemove: () => onState({ ...state, dateTo: '' }) }]
      : []),
    ...state.types.map((v) => ({
      key: `type:${v}`,
      label: t(EVENT_TYPE_LABEL[v]),
      onRemove: () => onState({ ...state, types: toggle(state.types, v) }),
    })),
    ...distanceChip(t, effective.maxKm, () => onState({ ...state, maxKm: null })),
    ...(state.free ? [{ key: 'free', label: t('filterFree'), onRemove: () => onState({ ...state, free: false }) }] : []),
    ...(state.recurring
      ? [{ key: 'recurring', label: t('filterRecurring'), onRemove: () => onState({ ...state, recurring: false }) }]
      : []),
  ];

  return (
    <TypedTab
      tab="events"
      query={query}
      chips={chips}
      state={state}
      onState={onState}
      hasLocation={hasLocation}
      renderRow={(e) => (
        <EventCard event={e} viewerStatus={eventViewerStatus(e)} onPress={() => router.push(`/event/${e.id}`)} />
      )}
      empty={
        <TypedEmpty
          q={q}
          kind="Events"
          filtered={chips.length > 0}
          onClear={() => onState(EMPTY_EVENTS_FILTERS)}
          testID="explore-events-empty"
        />
      }
    />
  );
}

function GroupsTab({ q, state, onState }: { q: string; state: GroupsFilterState; onState: (s: GroupsFilterState) => void }) {
  const { t } = useT('discovery');
  const router = useRouter();
  const { hasLocation } = useViewerHasLocation();
  const mine = useCommunities();
  const effective = withoutDistance(state, hasLocation);
  const query = useSearchGroups(q, toGroupFilters(effective), effective.sort);
  const names = new Map((mine.data ?? []).filter((r) => r.community).map((r) => [r.community!.id, r.community!.name]));

  const chips: AppliedChip[] = [
    ...sortChip(t, effective.sort, () => onState({ ...state, sort: 'relevant' })),
    ...state.communityIds.map((id) => ({
      key: `community:${id}`,
      label: names.get(id) ?? t('filterCommunity'),
      onRemove: () => onState({ ...state, communityIds: toggle(state.communityIds, id) }),
    })),
    ...distanceChip(t, effective.maxKm, () => onState({ ...state, maxKm: null })),
    ...(state.withUpcoming
      ? [{ key: 'upcoming', label: t('filterWithUpcoming'), onRemove: () => onState({ ...state, withUpcoming: false }) }]
      : []),
  ];

  return (
    <TypedTab
      tab="groups"
      query={query}
      chips={chips}
      state={state}
      onState={onState}
      hasLocation={hasLocation}
      renderRow={(g, index) => (
        <GroupCard
          group={g}
          orientation="horizontal"
          onPress={() => router.push(`/group/${g.id}`)}
          action={<GroupJoinAction group={g} index={index} />}
        />
      )}
      empty={
        <TypedEmpty
          q={q}
          kind="Groups"
          filtered={chips.length > 0}
          onClear={() => onState(EMPTY_GROUPS_FILTERS)}
          testID="explore-groups-empty"
        />
      }
    />
  );
}

function CommunitiesTab({
  q,
  state,
  onState,
}: {
  q: string;
  state: CommunitiesFilterState;
  onState: (s: CommunitiesFilterState) => void;
}) {
  const { t } = useT('discovery');
  const router = useRouter();
  const { hasLocation } = useViewerHasLocation();
  const effective = withoutDistance(state, hasLocation);
  const query = useSearchCommunities(q, toCommunityFilters(effective), effective.sort);

  const chips: AppliedChip[] = [
    ...sortChip(t, effective.sort, () => onState({ ...state, sort: 'relevant' })),
    ...state.types.map((v) => ({
      key: `type:${v}`,
      label: t(COMMUNITY_TYPE_LABEL[v]),
      onRemove: () => onState({ ...state, types: toggle(state.types, v) }),
    })),
    ...distanceChip(t, effective.maxKm, () => onState({ ...state, maxKm: null })),
    ...state.privacy.map((v) => ({
      key: `privacy:${v}`,
      label: t(PRIVACY_LABEL[v]),
      onRemove: () => onState({ ...state, privacy: toggle(state.privacy, v) }),
    })),
    ...(state.withUpcoming
      ? [{ key: 'upcoming', label: t('filterWithUpcoming'), onRemove: () => onState({ ...state, withUpcoming: false }) }]
      : []),
  ];

  return (
    <TypedTab
      tab="communities"
      query={query}
      chips={chips}
      state={state}
      onState={onState}
      hasLocation={hasLocation}
      renderRow={(c, index) => (
        <CommunityCard
          community={c}
          orientation="horizontal"
          onOpen={() => router.push(`/community/${c.id}`)}
          action={<CommunityJoinAction community={c} index={index} />}
        />
      )}
      empty={
        <TypedEmpty
          q={q}
          kind="Communities"
          filtered={chips.length > 0}
          onClear={() => onState(EMPTY_COMMUNITIES_FILTERS)}
          testID="explore-communities-empty"
        />
      }
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
