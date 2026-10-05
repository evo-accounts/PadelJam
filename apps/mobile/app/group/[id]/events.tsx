/**
 * All of a group's events (UX-GRP-05), from "See all" on the group page. Upcoming first, Past on
 * the second tab; each card opens the event. "Create event" sits at the top for anyone the
 * community allows to create one, and each tab has its own empty state.
 */
import { useCanCreateEvent, useGroup, useGroupEvents } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event/EventCard';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import { Button, EmptyState, emptyIcon, listEmptyContent, Segmented, TopBar } from '../../../components/ui';

type Tab = 'upcoming' | 'past';

export default function GroupEventsScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: group } = useGroup(id);
  const { data: events } = useGroupEvents(id);
  const { data: canCreate } = useCanCreateEvent(id);
  const [tab, setTab] = useState<Tab>('upcoming');

  // Fixed at mount: "upcoming" is relative to when the screen opened (React Compiler purity).
  const [now] = useState(() => Date.now());
  const all = events ?? [];
  const upcoming = all.filter((e) => e.status === 'scheduled' && new Date(e.starts_at).getTime() >= now);
  // Past, most recent first: everything that is not still ahead of us.
  const past = all.filter((e) => !upcoming.includes(e)).reverse();
  const rows = tab === 'upcoming' ? upcoming : past;
  const mayCreate = !!canCreate && !group?.archived_at;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('eventsTitle')} />
      <View style={styles.head}>
        {mayCreate ? (
          <Button
            label={t('groupEventsEmptyCta')}
            variant="secondary"
            fullWidth
            onPress={() =>
              router.push(`/event/create?groupId=${id}&communityId=${group?.community_id ?? ''}` as Href)
            }
            testID="group-events-create"
          />
        ) : null}
        <Segmented
          options={[
            { value: 'upcoming', label: t('upcomingTab') },
            { value: 'past', label: t('pastTab') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        contentContainerStyle={[styles.list, rows.length === 0 && listEmptyContent]}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => <EventCard event={item} onPress={() => router.push(`/event/${item.id}` as Href)} />}
        ListEmptyComponent={
          <EmptyState
            icon={emptyIcon('calendar')}
            title={tab === 'upcoming' ? t('upcomingEmptyTitle') : t('pastEmptyTitle')}
            body={tab === 'upcoming' ? t('groupEventsEmptyBody') : t('pastEmptyBody')}
            testID={`empty-group-events-${tab}`}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[3] },
  list: { padding: space[4] },
  gap: { height: space[2] },
});
