import {
  useExploreCommunities,
  useExploreEvents,
  useExploreGroups,
  useExplorePlayers,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event/EventCard';
import { CommunityCard } from '@/components/explore/CommunityCard';
import { GroupCard } from '@/components/explore/GroupCard';
import { PlayerCard } from '@/components/explore/PlayerCard';
import { SuggestionRail } from '@/components/explore/SuggestionRail';

export default function ExploreScreen() {
  const { t } = useT('discovery');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const players = useExplorePlayers();
  const events = useExploreEvents();
  const communities = useExploreCommunities();
  const groups = useExploreGroups();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        <SuggestionRail
          title={t('railPlayers')}
          seeAllLabel={t('seeAll')}
          onSeeAll={() => router.push('/explore/players')}
          data={players.data ?? []}
          isLoading={players.isLoading}
          isError={players.isError}
          emptyLabel={t('emptyPlayers')}
          errorLabel={t('loadError')}
          keyExtractor={(p) => p.id}
          renderItem={(p) => <PlayerCard player={p} />}
        />
        <SuggestionRail
          title={t('railEvents')}
          seeAllLabel={t('seeAll')}
          onSeeAll={() => router.push('/explore/events')}
          data={events.data ?? []}
          isLoading={events.isLoading}
          isError={events.isError}
          emptyLabel={t('emptyEvents')}
          errorLabel={t('loadError')}
          keyExtractor={(e) => e.id}
          renderItem={(e) => (
            <View style={{ width: 280 }}>
              <EventCard event={e} onPress={() => router.push(`/event/${e.id}`)} />
            </View>
          )}
        />
        <SuggestionRail
          title={t('railCommunities')}
          seeAllLabel={t('seeAll')}
          onSeeAll={() => router.push('/explore/communities')}
          data={communities.data ?? []}
          isLoading={communities.isLoading}
          isError={communities.isError}
          emptyLabel={t('emptyCommunities')}
          errorLabel={t('loadError')}
          keyExtractor={(c) => c.id}
          renderItem={(c) => (
            <CommunityCard
              community={c}
              onOpen={() => router.push(`/community/${c.id}/posts`)}
              onRequestJoin={() => router.push(`/community/${c.id}/join`)}
            />
          )}
        />
        <SuggestionRail
          title={t('railGroups')}
          seeAllLabel={t('seeAll')}
          onSeeAll={() => router.push('/explore/groups')}
          data={groups.data ?? []}
          isLoading={groups.isLoading}
          isError={groups.isError}
          emptyLabel={t('emptyGroups')}
          errorLabel={t('loadError')}
          keyExtractor={(g) => g.id}
          renderItem={(g) => <GroupCard group={g} onOpen={() => router.push(`/group/${g.id}`)} />}
        />
      </ScrollView>

      {/* Floating Create-Event button. Search icon is deferred (Search plan). */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => router.push('/event/create')}
        accessibilityRole="button"
        accessibilityLabel="Create event"
      >
        <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor="#fff" size={28} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { paddingTop: 8, gap: 8 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0B7BFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
