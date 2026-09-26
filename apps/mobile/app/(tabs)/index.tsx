import {
  useExploreEvents,
  useExploreGroups,
  useMyEvents,
  useMyEventStatuses,
  useMyGroups,
  useMyProfile,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CreateEventFab } from '@/components/CreateEventFab';
import { ChatHeaderButtonIcon } from '@/components/chat/ChatHeaderButton';
import { EventCard } from '@/components/event/EventCard';
import { GroupCard } from '@/components/group/GroupCard';
import { NotificationBellIcon } from '@/components/NotificationBell';
import { colors, palette } from '../../theme';
import { Button, Card, EmptyState, Text, TopBar } from '../../components/ui';

const QUICK_ACTIONS = [
  { key: 'quickCreate', icon: 'plus.circle.fill', android: 'add_circle', href: '/event/create' },
  { key: 'findEvent', icon: 'calendar', android: 'event', href: '/search?tab=events' },
  { key: 'findGroup', icon: 'person.3.fill', android: 'groups', href: '/search?tab=groups' },
  { key: 'findCommunity', icon: 'building.2.fill', android: 'location_city', href: '/search?tab=communities' },
] as const;

export default function HomeScreen() {
  const { t } = useT('home');
  const router = useRouter();
  // 'going' includes the waiting list and interested since 0112; the card labels those.
  const myEvents = useMyEvents('going');
  const { data: myStatuses } = useMyEventStatuses();
  const myGroups = useMyGroups();
  const profile = useMyProfile();

  const events = myEvents.data?.pages.flat() ?? [];
  const groups = myGroups.data ?? [];
  const loading = myEvents.isLoading || myGroups.isLoading || profile.isLoading;
  const errored = myEvents.isError && myGroups.isError;
  const hasActivity = events.length > 0 || groups.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        variant="top"
        title={t('title')}
        actions={[
          {
            icon: <ChatHeaderButtonIcon />,
            label: t('title', { ns: 'chat' }),
            onPress: () => router.push('/chat' as never),
          },
          {
            icon: <NotificationBellIcon />,
            label: t('title', { ns: 'notifications' }),
            onPress: () => router.push('/notifications' as never),
          },
          {
            icon: <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={22} tintColor={colors.foreground} />,
            label: t('search', { ns: 'discovery' }),
            onPress: () => router.push('/search' as never),
            testID: 'header-search',
          },
        ]}
      />
      <ScrollView contentContainerStyle={styles.content}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickScroll}
        style={styles.quickScrollWrapper}
      >
        {QUICK_ACTIONS.map((a) => (
          <Pressable
            key={a.key}
            style={styles.quickCard}
            onPress={() => router.push(a.href as never)}
            accessibilityRole="button"
          >
            <SymbolView name={{ ios: a.icon, android: a.android, web: a.android }} size={24} tintColor={colors.primary} />
            <Text variant="label">{t(a.key)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.foreground} style={{ marginTop: 40 }} />
      ) : errored ? (
        <Text variant="caption" tone="muted">{t('loadError')}</Text>
      ) : hasActivity ? (
        <>
          <SectionHeader title={t('nextEvents')} onSeeAll={() => router.push('/(tabs)/events' as never)} t={t} />
          {events.length === 0 ? (
            <Text variant="caption" tone="muted">{t('eventsEmpty')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {events.slice(0, 8).map((e: { id: string }) => (
                <EventCard
                  key={e.id}
                  event={e as never}
                  orientation="vertical"
                  viewerStatus={myStatuses?.[e.id]}
                  onPress={() => router.push(`/event/${e.id}` as never)}
                />
              ))}
            </ScrollView>
          )}

          {/* "My Groups" is a plain vertical stack (no ScrollView), so it takes
              full-width horizontal cards, not the rail's vertical ones. */}
          <SectionHeader title={t('myGroups')} onSeeAll={() => router.push('/groups' as never)} t={t} />
          {groups.length === 0 ? (
            <Text variant="caption" tone="muted">{t('groupsEmpty')}</Text>
          ) : (
            groups.slice(0, 5).map((g) => (
              <GroupCard
                key={g.group_id}
                group={g as never}
                memberCount={g.member_count}
                orientation="horizontal"
                onPress={() => router.push(`/group/${g.group_id}` as never)}
              />
            ))
          )}
        </>
      ) : (
        <NoActivityView profileHasLocation={!!profile.data?.location_text} router={router} t={t} />
      )}
      </ScrollView>
      <CreateEventFab />
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  onSeeAll,
  t,
}: {
  title: string;
  onSeeAll: () => void;
  t: (k: string) => string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="heading" style={styles.sectionTitle}>{title}</Text>
      <Button label={t('seeAll')} variant="ghost" size="sm" onPress={onSeeAll} />
    </View>
  );
}

function NoActivityView({
  profileHasLocation,
  router,
  t,
}: {
  profileHasLocation: boolean;
  router: ReturnType<typeof useRouter>;
  t: (k: string) => string;
}) {
  const suggestedEvents = useExploreEvents();
  const suggestedGroups = useExploreGroups();
  const evRows = suggestedEvents.data ?? [];
  const grRows = suggestedGroups.data ?? [];
  return (
    <>
      {!profileHasLocation ? (
        <Card
          style={styles.banner}
          onPress={() => router.push('/(onboarding)/location' as never)}
        >
          <Text variant="bodyStrong">{t('addLocationTitle')}</Text>
          <Text variant="caption" tone="muted">{t('addLocationBody')}</Text>
          <Text variant="label" tone="primary">{t('addLocationCta')}</Text>
        </Card>
      ) : null}

      <Text variant="heading" style={styles.sectionTitle}>{t('suggestedEvents')}</Text>
      {evRows.length === 0 ? (
        <EmptyState
          icon={
            <SymbolView
              name={{ ios: 'calendar', android: 'event', web: 'event' }}
              size={40}
              tintColor={colors.mutedForeground}
              accessibilityElementsHidden
            />
          }
          title={t('suggestedEventsEmpty')}
          action={{ label: t('createEventCta'), onPress: () => router.push('/event/create' as never) }}
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {evRows.map((e: { id: string }) => (
            <EventCard
              key={e.id}
              event={e as never}
              orientation="vertical"
              onPress={() => router.push(`/event/${e.id}` as never)}
            />
          ))}
        </ScrollView>
      )}

      <Text variant="heading" style={styles.sectionTitle}>{t('discoverGroups')}</Text>
      {grRows.length === 0 ? (
        <EmptyState
          icon={
            <SymbolView
              name={{ ios: 'person.3.fill', android: 'groups', web: 'groups' }}
              size={40}
              tintColor={colors.mutedForeground}
              accessibilityElementsHidden
            />
          }
          title={t('groupsEmpty')}
          // No action: the audit asks for a "Create Group" CTA, and groups can
          // only be created INSIDE a community (/community/[id]/group-create).
          // "Explore groups" was standing in for a button that should create,
          // which is worse than saying nothing — it sends people looking for
          // groups when they came to make one.
        />
      ) : (
        // Not a horizontally scrolling rail (no ScrollView wraps this map), so
        // per the orientation contract it takes full-width horizontal cards —
        // a vertical (rail-shaped) card must never appear stacked like this.
        grRows.map((g: { id: string }) => (
          <GroupCard
            key={g.id}
            group={g as never}
            orientation="horizontal"
            onPress={() => router.push(`/group/${g.id}` as never)}
          />
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8, paddingBottom: 100 },
  quickScrollWrapper: { marginHorizontal: -16, marginBottom: 8 },
  quickScroll: { paddingHorizontal: 16, gap: 10 },
  quickCard: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    minWidth: 80,
    shadowColor: colors.foreground,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.foreground, marginTop: 16, marginBottom: 8 },
  rail: { gap: 12, paddingRight: 16 },
  banner: { backgroundColor: palette.purple[100], borderRadius: 12, padding: 16, marginTop: 8, gap: 4 },
  empty: { color: colors.mutedForeground, fontSize: 14, paddingVertical: 8 },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
});
