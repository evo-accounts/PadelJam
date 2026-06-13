import {
  useExploreCommunitiesList,
  useExploreEventsList,
  useExploreGroupsList,
  useExplorePlayersList,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { EventCard } from '@/components/event/EventCard';
import { CommunityCard } from '@/components/explore/CommunityCard';
import { GroupCard } from '@/components/explore/GroupCard';
import { PlayerCard } from '@/components/explore/PlayerCard';

type ExploreType = 'players' | 'events' | 'communities' | 'groups';

export default function ExploreSeeAllScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const kind = (['players', 'events', 'communities', 'groups'].includes(type ?? '')
    ? type
    : 'communities') as ExploreType;
  const { t } = useT('discovery');
  const router = useRouter();

  // All four hooks are called unconditionally (Rules of Hooks); only the active one is enabled.
  const players = useExplorePlayersList();
  const events = useExploreEventsList();
  const communities = useExploreCommunitiesList();
  const groups = useExploreGroupsList();

  const titleKey = {
    players: 'seeAllTitlePlayers',
    events: 'seeAllTitleEvents',
    communities: 'seeAllTitleCommunities',
    groups: 'seeAllTitleGroups',
  }[kind] as 'seeAllTitlePlayers' | 'seeAllTitleEvents' | 'seeAllTitleCommunities' | 'seeAllTitleGroups';

  const emptyKey = {
    players: 'emptyPlayers',
    events: 'emptyEvents',
    communities: 'emptyCommunities',
    groups: 'emptyGroups',
  }[kind] as 'emptyPlayers' | 'emptyEvents' | 'emptyCommunities' | 'emptyGroups';

  const active = { players, events, communities, groups }[kind];
  const rows = (active.data?.pages.flat() ?? []) as ReadonlyArray<{ id: string }>;

  const renderItem = (item: { id: string }) => {
    if (kind === 'players') return <PlayerCard player={item as never} />;
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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t(titleKey) }} />
      {active.isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={styles.state} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.id}
          numColumns={kind === 'players' ? 3 : 1}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<Text style={styles.empty}>{active.isError ? t('loadError') : t(emptyKey)}</Text>}
          ListFooterComponent={active.isFetchingNextPage ? <ActivityIndicator color="#0B1F3A" style={styles.state} /> : null}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
          }}
          renderItem={({ item }) => renderItem(item)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  list: { padding: 16 },
  state: { paddingVertical: 24 },
  empty: { textAlign: 'center', color: '#6B7685', paddingVertical: 24 },
});
