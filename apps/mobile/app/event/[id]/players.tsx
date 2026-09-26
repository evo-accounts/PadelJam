/**
 * The Player list (UX-JEVT-08), from the chevron on the event page's Players card.
 *
 * The read-only counterpart of Manage players: tabs labelled with their counts — Confirmed
 * (n / capacity), Waiting list (only while the event has one), Invited (`event_invited_players`,
 * migration 0112, visible to anyone who can see the event — decision 14). A row opens that
 * player's profile; a guest (no account) carries a "Guest" tag and opens nothing. A waiting pair
 * is shown together, as it queues and claims as one unit. Nothing here acts on a player.
 */
import { useEvent, useEventInvitedPlayers, useEventParticipants } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { playerTabs, type PlayerRow } from '@/lib/eventPlayers';
import { useGoBack } from '@/lib/useGoBack';
import { Chevron } from '../../../components/event/EventDetailParts';
import { colors, radius, space } from '../../../theme';
import {
  Avatar,
  Badge,
  EmptyState,
  emptyIcon,
  ListRow,
  listEmptyContent,
  Segmented,
  TopBar,
} from '../../../components/ui';

type Tab = 'confirmed' | 'waiting' | 'invited';

export default function EventPlayersScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event } = useEvent(id);
  const participants = useEventParticipants(id);
  const invited = useEventInvitedPlayers(id);
  const [picked, setPicked] = useState<Tab>('confirmed');

  const tabs = playerTabs(participants.data ?? [], invited.data ?? []);
  const capacity = event
    ? event.num_courts * 4 + (event.allow_standby ? (event.standby_spots ?? 0) : 0)
    : 0;
  const hasWaiting = tabs.waiting.length > 0;
  // The waiting list can empty while its tab is open (a claim, a leave): fall back to Confirmed.
  const tab: Tab = picked === 'waiting' && !hasWaiting ? 'confirmed' : picked;

  const options = [
    { value: 'confirmed' as const, label: t('playersTabConfirmed', { n: tabs.confirmed.length, capacity }) },
    ...(hasWaiting ? [{ value: 'waiting' as const, label: t('playersTabWaiting', { n: tabs.waitingCount }) }] : []),
    { value: 'invited' as const, label: t('playersTabInvited', { n: tabs.invited.length }) },
  ];

  const renderRow = (p: PlayerRow) => {
    const name = p.name ?? '—';
    const profileId = p.profileId;
    return (
      <ListRow
        key={p.key}
        title={name}
        subtitle={p.standby ? t('playersListStandby') : undefined}
        leading={
          <Avatar uri={avatarUrl(p.avatarPath)} name={name} colourKey={profileId ?? p.key} size="md" decorative />
        }
        onPress={profileId ? () => router.push(`/profile/${profileId}` as Href) : undefined}
        trailing={p.guest ? <Badge label={t('guestTag')} /> : profileId ? <Chevron /> : undefined}
        // Only a pressable row is an accessibility element; a plain View's testID never reaches E2E.
        testID={profileId ? `event-player-${p.key}` : undefined}
      />
    );
  };

  const loading = participants.isLoading || (tab === 'invited' && invited.isLoading);
  let body: React.ReactNode;
  if (loading) {
    body = <ActivityIndicator color={colors.foreground} style={styles.loading} />;
  } else if (tab === 'confirmed' && tabs.confirmed.length === 0) {
    body = (
      <EmptyState
        icon={emptyIcon('person.2')}
        title={t('playersListEmpty')}
        body={t('playersListEmptyBody')}
        testID="event-players-empty"
      />
    );
  } else if (tab === 'invited' && tabs.invited.length === 0) {
    body = (
      <EmptyState
        icon={emptyIcon('person.badge.clock')}
        title={t('playersInvitedEmpty')}
        body={t('playersInvitedEmptyBody')}
        testID="event-players-invited-empty"
      />
    );
  } else if (tab === 'waiting') {
    body = tabs.waiting.map((entry) =>
      entry.players.length > 1 ? (
        <View key={entry.key} style={styles.pair} accessible={false}>
          {entry.players.map(renderRow)}
        </View>
      ) : (
        renderRow(entry.players[0]!)
      ),
    );
  } else {
    body = (tab === 'confirmed' ? tabs.confirmed : tabs.invited).map(renderRow);
  }

  const empty =
    !loading &&
    ((tab === 'confirmed' && tabs.confirmed.length === 0) || (tab === 'invited' && tabs.invited.length === 0));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('playersListTitle')} />
      <View style={styles.head}>
        <Segmented options={options} value={tab} onChange={setPicked} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, empty && listEmptyContent]}>{body}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: space[4], paddingTop: space[3] },
  content: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[8] },
  loading: { paddingVertical: space[6] },
  pair: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: radius.sm,
    paddingLeft: space[2],
    marginVertical: space[1],
  },
});
