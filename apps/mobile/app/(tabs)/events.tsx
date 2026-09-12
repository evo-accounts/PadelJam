import { useMyEvents, type MyEventsFilter } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateEventFab } from '@/components/CreateEventFab';
import { EventCard } from '@/components/event/EventCard';
import { colors } from '../../theme';
import { EmptyState, emptyIcon, listEmptyContent, TopBar } from '../../components/ui';

const FILTERS: MyEventsFilter[] = ['all', 'organizing', 'going'];

export default function EventsScreen() {
  const { t } = useT('events');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<MyEventsFilter>('all');
  const query = useMyEvents(filter);
  const rows = query.data?.pages.flat() ?? [];

  const label = { all: t('filterAll'), organizing: t('filterOrganizing'), going: t('filterGoing') };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="top" title={t('title')} />
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            accessibilityRole="button"
            style={[styles.chip, filter === f && styles.chipActive]}>
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{label[f]}</Text>
          </Pressable>
        ))}
      </View>
      {query.isLoading ? (
        <ActivityIndicator color={colors.foreground} style={styles.state} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[{ padding: 16, paddingBottom: insets.bottom + 96 }, listEmptyContent]}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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
                icon={emptyIcon('calendar')}
                title={t('empty')}
                body={t('eventsEmptyBody')}
                action={{
                  label: t('eventsEmptyCta'),
                  onPress: () => router.push('/(tabs)/explore?tab=events' as never),
                }}
                testID="empty-events"
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
            <EventCard event={item} onPress={() => router.push(`/event/${item.id}`)} />
          )}
        />
      )}
      <CreateEventFab />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.muted },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  chipTextActive: { color: colors.card },
  state: { paddingVertical: 24 },
});
