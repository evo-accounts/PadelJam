import {
  useExploreCommunities,
  useExploreEvents,
  useExploreGroups,
  useExplorePlayers,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateEventFab } from '@/components/CreateEventFab';
import { EventCard } from '@/components/event/EventCard';
import { CommunityCard } from '@/components/explore/CommunityCard';
import { GroupCard } from '@/components/explore/GroupCard';
import { PlayerCard } from '@/components/explore/PlayerCard';
import { ExploreList } from '@/components/explore/ExploreList';
import { SuggestionRail } from '@/components/explore/SuggestionRail';
import { Chip, TopBar } from '@/components/ui';
import { colors, radius } from '../../theme';

const TABS = ['foryou', 'events', 'groups', 'communities', 'players'] as const;
type TabKey = (typeof TABS)[number];

/** The tab key as it appears in `?tab=` — `players` is labelled "People". */
const isTabKey = (v: unknown): v is TabKey => TABS.includes(v as TabKey);

export default function ExploreScreen() {
  const { t } = useT('discovery');
  const params = useLocalSearchParams<{ tab?: string }>();

  // Home's quick actions deep-link straight to a tab. Reading the param on every
  // render rather than seeding state means tapping "Find Groups" while already
  // on Explore actually switches tabs, instead of being swallowed because the
  // screen was already mounted.
  const [override, setOverride] = useState<TabKey | null>(null);
  const fromParam = isTabKey(params.tab) ? params.tab : 'foryou';
  const tab = override ?? fromParam;

  const [query, setQuery] = useState('');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="top" title={t('title')} />
      <View style={styles.searchWrap}>
        {/* No autoFocus: arriving on Explore should not summon the keyboard. */}
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel={t('searchPlaceholder')}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.tabsWrap}
      >
        {TABS.map((k) => (
          <Chip
            key={k}
            label={t(`tab_${k}`)}
            selected={tab === k}
            onPress={() => {
              setOverride(k);
              // A query typed for one tab rarely means anything in another.
              setQuery('');
            }}
          />
        ))}
      </ScrollView>

      {tab === 'foryou' ? <ForYou query={query} /> : <ExploreList kind={tab} query={query} />}

      <CreateEventFab />
    </SafeAreaView>
  );
}

function ForYou({ query }: { query: string }) {
  const { t } = useT('discovery');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const players = useExplorePlayers();
  const events = useExploreEvents();
  const communities = useExploreCommunities();
  const groups = useExploreGroups();

  // A search term is meaningless against curated rails, so "For you" hands over
  // to the People list rather than filtering four rails into confusion.
  if (query.trim()) return <ExploreList kind="players" query={query} />;

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
          renderItem={(p) => <PlayerCard player={p} onPress={() => router.push(`/profile/${p.id}`)} />}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  search: {
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  tabsWrap: { flexGrow: 0 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  content: { paddingTop: 8, gap: 8 },
});
