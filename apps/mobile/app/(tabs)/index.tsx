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
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EventCard } from '@/components/event/EventCard';
import { GroupCard } from '@/components/explore/GroupCard';

const QUICK_ACTIONS = [
  { key: 'quickCreate', icon: 'plus.circle.fill', android: 'add_circle', href: '/event/create' },
  { key: 'findEvent', icon: 'calendar', android: 'event', href: '/explore/events' },
  { key: 'findGroup', icon: 'person.3.fill', android: 'groups', href: '/explore/groups' },
  { key: 'findCommunity', icon: 'building.2.fill', android: 'location_city', href: '/explore/communities' },
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
            <SymbolView name={{ ios: a.icon, android: a.android, web: a.android }} size={24} tintColor="#0B7BFF" />
            <Text style={styles.quickLabel}>{t(a.key)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 40 }} />
      ) : errored ? (
        <Text style={styles.empty}>{t('loadError')}</Text>
      ) : hasActivity ? (
        <>
          <SectionHeader title={t('nextEvents')} onSeeAll={() => router.push('/(tabs)/events' as never)} t={t} />
          {events.length === 0 ? (
            <Text style={styles.empty}>{t('eventsEmpty')}</Text>
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
            <Text style={styles.empty}>{t('groupsEmpty')}</Text>
          ) : (
            groups.slice(0, 5).map((g) => (
              <Pressable
                key={g.group_id}
                style={styles.groupRow}
                onPress={() => router.push(`/group/${g.group_id}` as never)}
                accessibilityRole="button"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupSub}>{g.community_name}</Text>
                </View>
                <Text style={styles.groupCount}>{t('memberCount', { count: g.member_count })}</Text>
              </Pressable>
            ))
          )}
        </>
      ) : (
        <EmptyState profileHasLocation={!!profile.data?.location_text} router={router} t={t} />
      )}
    </ScrollView>
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
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onSeeAll} accessibilityRole="button">
        <Text style={styles.seeAll}>{t('seeAll')}</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({
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
        <Pressable
          style={styles.banner}
          onPress={() => router.push('/(onboarding)/location' as never)}
          accessibilityRole="button"
        >
          <Text style={styles.bannerTitle}>{t('addLocationTitle')}</Text>
          <Text style={styles.bannerBody}>{t('addLocationBody')}</Text>
          <Text style={styles.bannerCta}>{t('addLocationCta')}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.sectionTitle}>{t('suggestedEvents')}</Text>
      {evRows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>{t('eventsEmpty')}</Text>
          <Pressable
            style={styles.emptyCardBtn}
            onPress={() => router.push('/explore/events' as never)}
            accessibilityRole="button"
          >
            <Text style={styles.emptyCardBtnText}>{t('eventsDiscoverCta')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {evRows.map((e: { id: string }) => (
            <View key={e.id} style={styles.railItem}>
              <EventCard event={e as never} onPress={() => router.push(`/event/${e.id}` as never)} />
            </View>
          ))}
        </ScrollView>
      )}

      <Text style={styles.sectionTitle}>{t('discoverGroups')}</Text>
      {grRows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>{t('groupsEmpty')}</Text>
          <Pressable
            style={styles.emptyCardBtn}
            onPress={() => router.push('/explore/groups' as never)}
            accessibilityRole="button"
          >
            <Text style={styles.emptyCardBtnText}>{t('groupsDiscoverCta')}</Text>
          </Pressable>
        </View>
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
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  quickScrollWrapper: { marginHorizontal: -16, marginBottom: 8 },
  quickScroll: { paddingHorizontal: 16, gap: 10 },
  quickCard: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 80,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  quickLabel: { fontSize: 11, color: '#0B1F3A', fontWeight: '600', textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0B1F3A', marginTop: 16, marginBottom: 8 },
  seeAll: { fontSize: 14, color: '#0B7BFF', fontWeight: '600' },
  rail: { gap: 12, paddingRight: 16 },
  railItem: { width: 260 },
  groupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 6,
  },
  groupName: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  groupSub: { fontSize: 13, color: '#6B7685', marginTop: 2 },
  groupCount: { fontSize: 13, color: '#6B7685' },
  banner: { backgroundColor: '#EAF2FF', borderRadius: 12, padding: 16, marginTop: 8, gap: 4 },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  bannerBody: { fontSize: 13, color: '#3A4A5E' },
  bannerCta: { fontSize: 14, color: '#0B7BFF', fontWeight: '700', marginTop: 6 },
  empty: { color: '#6B7685', fontSize: 14, paddingVertical: 8 },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  emptyCardText: { fontSize: 14, color: '#6B7685', textAlign: 'center' },
  emptyCardBtn: {
    backgroundColor: '#0B7BFF',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyCardBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
