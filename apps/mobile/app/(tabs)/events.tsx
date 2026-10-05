/**
 * My Events (UX-JEVT-01): four tabs — All, Organizing, Going, Pending (invitations not answered
 * yet) — under a "Show past events" toggle, off by default and remembered on this device. With it
 * on, past events follow the current ones in every tab (`my_events` p_include_past, migration
 * 0112) — the only place an event without a group can still be found once it has happened.
 * Each tab has its own empty state (UX-GLOB-03). No search action: global search lives on Explore
 * (UX-GLOB-05).
 */
import { useMyEvents, useMyEventStatuses, type MyEventsFilter } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CreateEventFab, FAB_CLEARANCE } from '@/components/CreateEventFab';
import { EventCard } from '@/components/event/EventCard';
import { useStoredFlag } from '@/lib/useStoredFlag';
import { colors, space } from '../../theme';
import {
  EmptyState,
  emptyIcon,
  listEmptyContent,
  Segmented,
  SwitchRow,
  TopBar,
} from '../../components/ui';

const FILTERS = ['all', 'organizing', 'going', 'pending'] as const satisfies readonly MyEventsFilter[];

export default function EventsScreen() {
  const { t } = useT('events');
  const router = useRouter();
  const [filter, setFilter] = useState<MyEventsFilter>('all');
  const [includePast, setIncludePast, pastHydrated] = useStoredFlag('events.showPast', false);
  // Wait for the remembered toggle: fetching with the default first would load (and flash) the
  // wrong list for anyone who left it on.
  const query = useMyEvents(filter, includePast, { enabled: pastHydrated });
  const { data: statuses } = useMyEventStatuses();
  const rows = query.data?.pages.flat() ?? [];

  const label = {
    all: t('filterAll'),
    organizing: t('filterOrganizing'),
    going: t('filterGoing'),
    pending: t('filterPending'),
  };

  const findEvents = { label: t('eventsEmptyCta'), onPress: () => router.push('/(tabs)/explore?tab=events' as never) };
  const empty = {
    all: {
      icon: 'calendar',
      title: includePast ? t('emptyWithPast') : t('empty'),
      body: t('eventsEmptyBody'),
      action: findEvents,
    },
    organizing: {
      icon: 'calendar',
      title: t('emptyOrganizing'),
      body: t('emptyOrganizingBody'),
      action: { label: t('emptyOrganizingCta'), onPress: () => router.push('/event/create' as never) },
    },
    going: { icon: 'calendar', title: t('emptyGoing'), body: t('emptyGoingBody'), action: findEvents },
    pending: { icon: 'person.badge.clock', title: t('emptyPending'), body: t('emptyPendingBody'), action: undefined },
  } as const;
  const emptyCopy = empty[filter];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="top" title={t('title')} />
      <View style={styles.head}>
        <SwitchRow
          label={t('showPast')}
          value={includePast}
          onValueChange={setIncludePast}
          testID="events-show-past"
        />
        <Segmented
          options={FILTERS.map((f) => ({ value: f, label: label[f] }))}
          value={filter}
          onChange={setFilter}
        />
      </View>
      {query.isLoading || !pastHydrated ? (
        <ActivityIndicator color={colors.foreground} style={styles.state} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[{ padding: space[4], paddingBottom: FAB_CLEARANCE }, listEmptyContent]}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          ListEmptyComponent={
            query.isError ? (
              <EmptyState
                fill
                tone="error"
                title={t('loadError')}
                action={{ label: t('retry', { ns: 'common' }), onPress: () => query.refetch() }}
                testID="empty-events"
              />
            ) : (
              <EmptyState
                fill
                icon={emptyIcon(emptyCopy.icon)}
                title={emptyCopy.title}
                body={emptyCopy.body}
                action={emptyCopy.action}
                testID={`empty-events-${filter}`}
              />
            )
          }
          ListFooterComponent={
            query.isFetchingNextPage ? <ActivityIndicator color={colors.foreground} style={styles.state} /> : null
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              viewerStatus={statuses?.[item.id]}
              onPress={() => router.push(`/event/${item.id}`)}
            />
          )}
        />
      )}
      <CreateEventFab />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[3] },
  gap: { height: space[3] },
  state: { paddingVertical: space[6] },
});
