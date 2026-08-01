import { useCommunityEvents } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCommunityId } from '@/components/community/CommunityIdContext';
import { EventCard } from '@/components/event/EventCard';
import { colors } from '../../../../theme';

type Filter = 'all' | 'organizing';

export default function CommunityEventsScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const id = useCommunityId();
  const uid = useSession().session?.user.id;
  const { data: events, isLoading, isError } = useCommunityEvents(id);
  const [filter, setFilter] = useState<Filter>('all');

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  const rows = events ?? [];
  const visible = filter === 'organizing' ? rows.filter((e) => e.organizer_id === uid) : rows;

  const header = (
    <View style={styles.filters}>
      <FilterPill label={t('filterAll')} active={filter === 'all'} onPress={() => setFilter('all')} />
      <FilterPill
        label={t('filterOrganizing')}
        active={filter === 'organizing'}
        onPress={() => setFilter('organizing')}
      />
    </View>
  );

  if (visible.length === 0) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}>
          <Text style={[styles.empty, isError && styles.error]}>
            {isError
              ? t('loadError')
              : filter === 'organizing'
                ? t('eventsEmptyOrganizing')
                : t('eventsEmpty')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={visible}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <EventCard event={item} onPress={() => router.push(`/event/${item.id}` as Href)} />
        )}
      />
    </View>
  );
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: colors.mutedForeground },
  error: { color: colors.destructive, fontWeight: '600' },
  listContent: { paddingHorizontal: 12, paddingVertical: 8 },
  separator: { height: 8 },
  filters: { flexDirection: 'row', gap: 8, paddingTop: 8, paddingBottom: 4 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.muted,
  },
  pillActive: { backgroundColor: colors.primary },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.mutedForeground },
  pillTextActive: { color: colors.card },
});
