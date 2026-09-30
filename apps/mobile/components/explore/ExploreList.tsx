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
 * The paginated list for one explore kind: the See-all screens
 * (`app/explore/[type].tsx`, UX-EXPL-03). It lists recommendations and does not
 * search — B3: it used to filter the rows already loaded by name, so a match on
 * page 3 was invisible until scrolled. Search is Explore's own, on the server
 * (`components/explore/search`, migration 0129).
 *
 * B2: this used to call all four list hooks whatever `kind` was, so every list
 * screen fetched four lists. Each kind is now its own component calling only
 * its own hook, and switching kind swaps the component (a remount), which is
 * what Rules of Hooks wanted all along.
 *
 * Rows are the horizontal cards of UX-GLOB-09 with the inline actions of
 * UX-EXPL-02: Follow on players, Join / Request on communities, Join on groups.
 */
type ListProps = { kind: ExploreKind };

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

function ExploreListBody({ kind, list }: ListProps & { list: InfiniteList }) {
  const { t } = useT('discovery');
  const router = useRouter();

  const all = (list.data?.pages.flat() ?? []) as ReadonlyArray<Record<string, unknown> & { id: string }>;
  const rows = useStickyRows(STICKY_KIND[kind], all);

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
