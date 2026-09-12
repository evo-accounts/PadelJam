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
import { GroupCard } from '@/components/explore/GroupCard';
import { PlayerCard } from '@/components/explore/PlayerCard';
import { EmptyState, emptyIcon } from '@/components/ui';
import { colors } from '../../theme';

export type ExploreKind = 'players' | 'events' | 'communities' | 'groups';

/**
 * The paginated list for one explore kind.
 *
 * Extracted from `app/explore/[type].tsx` so the Explore TAB and the "see all"
 * ROUTE render the same thing. They were always going to diverge otherwise —
 * the tab is the primary surface now, and the route is still where each
 * suggestion rail's "see all" lands.
 *
 * All four hooks are called unconditionally (Rules of Hooks) and only the active
 * one is enabled; that was already true in the route and is why this extraction
 * is a move rather than a rewrite.
 */
export function ExploreList({ kind, query = '' }: { kind: ExploreKind; query?: string }) {
  const { t } = useT('discovery');
  const router = useRouter();

  const players = useExplorePlayersList();
  const events = useExploreEventsList();
  const communities = useExploreCommunitiesList();
  const groups = useExploreGroupsList();

  const active = { players, events, communities, groups }[kind];
  const all = (active.data?.pages.flat() ?? []) as ReadonlyArray<Record<string, unknown>>;

  // Client-side, over what is already loaded. Deliberately not a server query:
  // browsing is the primary interaction and the lists are short, so this narrows
  // what you can see rather than pretending to search the whole database. If
  // that stops being true, this is the seam where a real query goes.
  const q = query.trim().toLowerCase();
  const rows = (
    q
      ? all.filter((item) => {
          const name = (item.name ?? item.full_name ?? '') as string;
          return name.toLowerCase().includes(q);
        })
      : all
  ) as ReadonlyArray<{ id: string }>;

  const emptyKey = {
    players: 'emptyPlayers',
    events: 'emptyEvents',
    communities: 'emptyCommunities',
    groups: 'emptyGroups',
  }[kind] as 'emptyPlayers' | 'emptyEvents' | 'emptyCommunities' | 'emptyGroups';

  const renderItem = (item: { id: string }) => {
    if (kind === 'players')
      return <PlayerCard player={item as never} onPress={() => router.push(`/profile/${item.id}`)} />;
    if (kind === 'events')
      return <EventCard event={item as never} onPress={() => router.push(`/event/${item.id}`)} />;
    if (kind === 'communities')
      return (
        <CommunityCard
          community={item as never}
          onOpen={() => router.push(`/community/${item.id}/posts`)}
          onRequestJoin={() => router.push(`/community/${item.id}/join`)}
        />
      );
    return <GroupCard group={item as never} onOpen={() => router.push(`/group/${item.id}`)} />;
  };

  if (active.isLoading) {
    return <ActivityIndicator color={colors.foreground} style={styles.state} />;
  }

  return (
    <FlashList
      data={rows}
      keyExtractor={(item) => item.id}
      numColumns={kind === 'players' ? 3 : 1}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListEmptyComponent={
        active.isError ? (
          <EmptyState
            tone="error"
            title={t('loadError', { ns: 'common' })}
            action={{ label: t('retry', { ns: 'common' }), onPress: () => active.refetch() }}
            testID="empty-explore"
          />
        ) : q ? (
          // A query that matches nothing is not the same as having nothing —
          // saying "no communities yet" to someone who typed "zzz" is wrong.
          <EmptyState
            icon={emptyIcon('magnifyingglass')}
            title={t('noMatches')}
            body={t('tryBroaderSearch')}
            testID="empty-explore"
          />
        ) : (
          <EmptyState icon={emptyIcon('magnifyingglass')} title={t(emptyKey)} testID="empty-explore" />
        )
      }
      ListFooterComponent={
        active.isFetchingNextPage ? (
          <ActivityIndicator color={colors.foreground} style={styles.state} />
        ) : null
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
      }}
      renderItem={({ item }) => renderItem(item)}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  state: { paddingVertical: 24 },
});
