import {
  useExploreEvents,
  useExploreGroups,
  useMyEvents,
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
import { GroupCard } from '@/components/explore/GroupCard';
import { NotificationBellIcon } from '@/components/NotificationBell';
import { colors, palette } from '../../theme';
import { Button, Card, EmptyState, ListRow, Text, TopBar } from '../../components/ui';

const QUICK_ACTIONS = [
  { key: 'quickCreate', icon: 'plus.circle.fill', android: 'add_circle', href: '/event/create' },
  { key: 'findEvent', icon: 'calendar', android: 'event', href: '/(tabs)/explore?tab=events' },
  { key: 'findGroup', icon: 'person.3.fill', android: 'groups', href: '/(tabs)/explore?tab=groups' },
  { key: 'findCommunity', icon: 'building.2.fill', android: 'location_city', href: '/(tabs)/explore?tab=communities' },
] as const;

export default function HomeScreen() {
  const { t } = useT('home');
  const router = useRouter();
  const myEvents = useMyEvents('going');
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
                <View key={e.id} style={styles.railItem}>
                  <EventCard event={e as never} onPress={() => router.push(`/event/${e.id}` as never)} />
                </View>
              ))}
            </ScrollView>
          )}

          <SectionHeader title={t('myGroups')} onSeeAll={() => router.push('/groups' as never)} t={t} />
          {groups.length === 0 ? (
            <Text variant="caption" tone="muted">{t('groupsEmpty')}</Text>
          ) : (
            groups.slice(0, 5).map((g) => (
              <ListRow
                key={g.group_id}
                title={g.name}
                subtitle={g.community_name}
                trailing={
                  <Text variant="hint" tone="muted">
                    {t('memberCount', { count: g.member_count })}
                  </Text>
                }
                trailingLabel={t('memberCount', { count: g.member_count })}
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
            <View key={e.id} style={styles.railItem}>
              <EventCard event={e as never} onPress={() => router.push(`/event/${e.id}` as never)} />
            </View>
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
        grRows.map((g: { id: string }) => (
          <View key={g.id} style={styles.railItem}>
            <GroupCard group={g as never} onOpen={() => router.push(`/group/${g.id}` as never)} />
          </View>
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
  railItem: { width: 260 },
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
