import {
  useExploreCommunitiesList,
  useExploreEventsList,
  useExploreGroupsList,
  useExplorePlayersList,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EventCard } from '@/components/event/EventCard';
import { CommunityCard } from '@/components/explore/CommunityCard';
import {
  CommunityJoinAction,
  GroupJoinAction,
  PlayerFollowAction,
  useStickyRows,
  type ActionKind,
} from '@/components/explore/ExploreActions';
import { PlayerCard } from '@/components/explore/PlayerCard';
import { GroupCard } from '@/components/group/GroupCard';
import { EmptyState, emptyIcon, listEmptyContent } from '@/components/ui';
import { colors } from '../../theme';

export type ExploreKind = 'players' | 'events' | 'communities' | 'groups';

/**
 * The chip strip of the legacy `/search` screen (UX-GLOB-08), which M1 leaves
 * in place with nothing linking to it; M2 turns that route into a redirect to
 * Explore's search. `foryou` there means "people".
 */
export const EXPLORE_TABS = ['foryou', 'events', 'groups', 'communities', 'players'] as const;
export type ExploreTab = (typeof EXPLORE_TABS)[number];

/**
 * The kinds Explore's search state offers as tabs, in the audit's order (UX-EXPL-06). `people` is
 * an M1 stop-gap: until the "All" tab arrives with 0129 / M2, a player is only findable here.
 */
export const SEARCH_KINDS = ['events', 'groups', 'communities', 'players'] as const satisfies readonly ExploreKind[];

/**
 * The paginated list for one explore kind: the See-all screens
 * (`app/explore/[type].tsx`, UX-EXPL-03), the interim search state on the
 * Explore tab, and `/search` until M2 turns it into a redirect.
 *
 * B2: this used to call all four list hooks whatever `kind` was, so every list
 * screen fetched four lists. Each kind is now its own component calling only
 * its own hook, and switching kind swaps the component (a remount), which is
 * what Rules of Hooks wanted all along.
 *
 * Rows are the horizontal cards of UX-GLOB-09 with the inline actions of
 * UX-EXPL-02: Follow on players, Join / Request on communities, Join on groups.
 */
type ListProps = {
  kind: ExploreKind;
  query?: string;
  /** Passed by the search states: the input stays focused while the list is dragged or tapped. */
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
};

export function ExploreList(props: ListProps) {
  switch (props.kind) {
    case 'players':
      return <PlayersList {...props} />;
    case 'events':
      return <EventsList {...props} />;
    case 'communities':
      return <CommunitiesList {...props} />;
    case 'groups':
      return <GroupsList {...props} />;
  }
}

function PlayersList(props: ListProps) {
  return <ExploreListBody {...props} list={useExplorePlayersList()} />;
}
function EventsList(props: ListProps) {
  return <ExploreListBody {...props} list={useExploreEventsList()} />;
}
function CommunitiesList(props: ListProps) {
  return <ExploreListBody {...props} list={useExploreCommunitiesList()} />;
}
function GroupsList(props: ListProps) {
  return <ExploreListBody {...props} list={useExploreGroupsList()} />;
}

/** The slice of an infinite query the list reads — the four hooks differ only in their rows. */
type InfiniteList = {
  data?: { pages: ReadonlyArray<ReadonlyArray<unknown>> };
  isLoading: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
};

const STICKY_KIND: Record<ExploreKind, ActionKind | null> = {
  players: 'players',
  events: null,
  communities: 'communities',
  groups: 'groups',
};

function ExploreListBody({
  kind,
  query = '',
  keyboardDismissMode,
  keyboardShouldPersistTaps,
  list,
}: ListProps & { list: InfiniteList }) {
  const { t } = useT('discovery');
  const router = useRouter();

  const all = (list.data?.pages.flat() ?? []) as ReadonlyArray<Record<string, unknown> & { id: string }>;
  const loaded = useStickyRows(STICKY_KIND[kind], all);

  // Client-side, over what is already loaded (B3: server search arrives with 0129 / M2).
  const q = query.trim().toLowerCase();
  const rows = q
    ? loaded.filter((item) => {
        const name = (item.name ?? item.full_name ?? '') as string;
        return name.toLowerCase().includes(q);
      })
    : loaded;

  const emptyKey = {
    players: 'emptyPlayers',
    events: 'emptyEvents',
    communities: 'emptyCommunities',
    groups: 'emptyGroups',
  }[kind] as 'emptyPlayers' | 'emptyEvents' | 'emptyCommunities' | 'emptyGroups';

  const renderItem = (item: { id: string }, index: number) => {
    if (kind === 'players')
      return (
        <PlayerCard
          player={item as never}
          orientation="horizontal"
          onPress={() => router.push(`/profile/${item.id}`)}
          action={<PlayerFollowAction player={item as never} index={index} />}
        />
      );
    if (kind === 'events')
      return (
        <EventCard event={item as never} orientation="horizontal" onPress={() => router.push(`/event/${item.id}`)} />
      );
    if (kind === 'communities')
      return (
        <CommunityCard
          community={item as never}
          orientation="horizontal"
          onOpen={() => router.push(`/community/${item.id}`)}
          action={<CommunityJoinAction community={item as never} index={index} />}
        />
      );
    return (
      <GroupCard
        group={item as never}
        orientation="horizontal"
        onPress={() => router.push(`/group/${item.id}`)}
        action={<GroupJoinAction group={item as never} index={index} />}
      />
    );
  };

  if (list.isLoading) {
    return <ActivityIndicator color={colors.foreground} style={styles.state} />;
  }

  return (
    <FlashList
      data={rows}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.list, listEmptyContent]}
      keyboardDismissMode={keyboardDismissMode}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListEmptyComponent={
        list.isError ? (
          <EmptyState
            fill
            tone="error"
            title={t('loadError', { ns: 'common' })}
            action={{ label: t('retry', { ns: 'common' }), onPress: () => void list.refetch() }}
            testID="empty-explore"
          />
        ) : q ? (
          // A query that matches nothing is not the same as having nothing —
          // saying "no communities yet" to someone who typed "zzz" is wrong.
          <EmptyState
            fill
            icon={emptyIcon('magnifyingglass')}
            title={t('noMatches')}
            body={t('tryBroaderSearch')}
            testID="empty-explore"
          />
        ) : (
          <EmptyState fill icon={emptyIcon('magnifyingglass')} title={t(emptyKey)} testID="empty-explore" />
        )
      }
      ListFooterComponent={
        list.isFetchingNextPage ? <ActivityIndicator color={colors.foreground} style={styles.state} /> : null
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
      }}
      renderItem={({ item, index }) => renderItem(item, index)}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  state: { paddingVertical: 24 },
});
