import {
  useExploreCommunities,
  useExploreEvents,
  useExploreGroups,
  useExplorePlayers,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateEventFab } from '@/components/CreateEventFab';
import { EventCard } from '@/components/event/EventCard';
import { CommunityCard } from '@/components/explore/CommunityCard';
import { PlayerCard } from '@/components/explore/PlayerCard';
import { GroupCard } from '@/components/group/GroupCard';
import { EXPLORE_TABS, ExploreList, type ExploreTab } from '@/components/explore/ExploreList';
import { SuggestionRail } from '@/components/explore/SuggestionRail';
import { Chip, TopBar } from '@/components/ui';
import { colors } from '../../theme';

type TabKey = ExploreTab;

/** The tab key as it appears in `?tab=` — `players` is labelled "People". */
const isTabKey = (v: unknown): v is TabKey => EXPLORE_TABS.includes(v as TabKey);

export default function ExploreScreen() {
  const { t } = useT('discovery');
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();

  // Home's quick actions deep-link straight to a tab. Reading the param on every
  // render rather than seeding state means tapping "Find Groups" while already
  // on Explore actually switches tabs, instead of being swallowed because the
  // screen was already mounted.
  const [override, setOverride] = useState<TabKey | null>(null);
  const fromParam = isTabKey(params.tab) ? params.tab : 'foryou';
  const tab = override ?? fromParam;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        variant="top"
        title={t('title')}
        actions={[
          {
            icon: <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={22} tintColor={colors.foreground} />,
            label: t('search'),
            onPress: () => router.push('/search' as never),
            testID: 'header-search',
          },
        ]}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.tabsWrap}
      >
        {EXPLORE_TABS.map((k) => (
          <Chip key={k} label={t(`tab_${k}`)} selected={tab === k} onPress={() => setOverride(k)} />
        ))}
      </ScrollView>

      {tab === 'foryou' ? <ForYou /> : <ExploreList kind={tab} />}

      <CreateEventFab />
    </SafeAreaView>
  );
}

function ForYou() {
  const { t } = useT('discovery');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const players = useExplorePlayers();
  const events = useExploreEvents();
  const communities = useExploreCommunities();
  const groups = useExploreGroups();

  return (
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
          renderItem={(p) => (
            <PlayerCard player={p} orientation="vertical" onPress={() => router.push(`/profile/${p.id}`)} />
          )}
          onRetry={() => players.refetch()}
          testID="empty-rail-players"
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
            <EventCard event={e} orientation="vertical" onPress={() => router.push(`/event/${e.id}`)} />
          )}
          onRetry={() => events.refetch()}
          testID="empty-rail-events"
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
              orientation="vertical"
              onOpen={() => router.push(`/community/${c.id}`)}
              onRequestJoin={() => router.push(`/community/${c.id}/join`)}
            />
          )}
          onRetry={() => communities.refetch()}
          testID="empty-rail-communities"
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
          renderItem={(g) => (
            <GroupCard group={g} orientation="vertical" onPress={() => router.push(`/group/${g.id}`)} />
          )}
          onRetry={() => groups.refetch()}
          testID="empty-rail-groups"
        />
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabsWrap: { flexGrow: 0 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  content: { paddingTop: 8, gap: 8 },
});
