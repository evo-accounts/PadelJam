import { useMyEvents, type MyEventsFilter } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateEventFab } from '@/components/CreateEventFab';
import { EventCard } from '@/components/event/EventCard';

const FILTERS: MyEventsFilter[] = ['all', 'organizing', 'going'];

export default function EventsScreen() {
  const { t } = useT('events');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<MyEventsFilter>('all');
  const query = useMyEvents(filter);
  const rows = (query.data?.pages.flat() ?? []) as ReadonlyArray<{ id: string }>;

  const label = { all: t('filterAll'), organizing: t('filterOrganizing'), going: t('filterGoing') };

  return (
    <View style={styles.container}>
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
        <ActivityIndicator color="#0B1F3A" style={styles.state} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <Text style={styles.empty}>{query.isError ? t('loadError') : t('empty')}</Text>
          }
          ListFooterComponent={
            query.isFetchingNextPage ? <ActivityIndicator color="#0B1F3A" style={styles.state} /> : null
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          renderItem={({ item }) => (
            <EventCard event={item as never} onPress={() => router.push(`/event/${item.id}`)} />
          )}
        />
      )}
      <CreateEventFab />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E7ECF3' },
  chipActive: { backgroundColor: '#0B1F3A' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#0B1F3A' },
  chipTextActive: { color: '#fff' },
  state: { paddingVertical: 24 },
  empty: { textAlign: 'center', color: '#6B7685', paddingVertical: 24 },
});
