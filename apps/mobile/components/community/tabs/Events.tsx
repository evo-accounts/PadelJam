import { useAbility, useCommunityEvents } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useCommunityId } from '@/components/community/CommunityIdContext';
import { EventCard } from '@/components/event/EventCard';
import { colors } from '../../../theme';
import { Chip, EmptyState, emptyIcon, listEmptyContent } from '../../ui';

type Filter = 'all' | 'organizing';

export default function CommunityEventsScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const id = useCommunityId();
  const uid = useSession().session?.user.id;
  const { data: events, isLoading, isError, refetch } = useCommunityEvents(id);
  const { data: ability } = useAbility(id);
  // Same ability check community groups/posts/members use: only owners and
  // admins (community managers) can create events for the community.
  const canCreateEvent = ability?.can('create', 'Event') ?? false;
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

  return (
    <View style={styles.container}>
      <FlashList
        data={visible}
        keyExtractor={(e) => e.id}
        contentContainerStyle={[styles.listContent, listEmptyContent]}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <EventCard event={item} onPress={() => router.push(`/event/${item.id}` as Href)} />
        )}
        ListEmptyComponent={
          isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError', { ns: 'common' })}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => refetch() }}
              testID="empty-community-events"
            />
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('calendar')}
              title={filter === 'organizing' ? t('eventsEmptyOrganizing') : t('eventsEmpty')}
              body={t('communityEventsEmptyBody')}
              action={
                canCreateEvent
                  ? {
                      label: t('communityEventsEmptyCta'),
                      onPress: () => router.push(`/event/create?communityId=${id}` as Href),
                    }
                  : undefined
              }
              testID="empty-community-events"
            />
          )
        }
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
    <Chip
      onPress={onPress}
      label={label}
      selected={active}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  listContent: { paddingHorizontal: 12, paddingVertical: 8 },
  separator: { height: 8 },
  filters: { flexDirection: 'row', gap: 8, paddingTop: 8, paddingBottom: 4 },
});
