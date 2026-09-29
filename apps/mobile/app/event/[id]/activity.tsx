import { useEventActivity, type ActivityRow } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../../theme';
import { Avatar, EmptyState, emptyIcon, listEmptyContent, TopBar } from '../../../components/ui';
import { avatarUrl } from '@/lib/community-images';

/** Map an activity row to a localized one-line sentence. */
function lineFor(t: (k: string, o?: Record<string, unknown>) => string, row: ActivityRow): string {
  const actor = row.profiles?.full_name ?? 'Someone';
  const target = row.detail?.target_name ?? row.detail?.guest_name ?? '—';
  const key: Record<string, string> = {
    joined: 'activityJoined',
    left: 'activityLeft',
    confirmed: 'activityConfirmed',
    removed: 'activityRemoved',
    guest_added: 'activityGuestAdded',
    marked_paid: 'activityMarkedPaid',
    marked_unpaid: 'activityMarkedUnpaid',
    marked_all_paid: 'activityMarkedAllPaid',
    team_assigned: 'activityTeamAssigned',
    team_switched: 'activityTeamSwitched',
    team_removed: 'activityTeamRemoved',
    event_edited: 'activityEventEdited',
    invited: 'activityInvited',
    invite_accepted: 'activityInviteAccepted',
    invite_declined: 'activityInviteDeclined',
    // Written server-side since migration 0122 (UX-MEVT-17).
    waitlist_joined: 'activityWaitlistJoined',
    waitlist_claimed: 'activityWaitlistClaimed',
    partner_invite_sent: 'activityPartnerInviteSent',
    partner_invite_accepted: 'activityPartnerInviteAccepted',
    partner_invite_declined: 'activityPartnerInviteDeclined',
    fee_changed: 'activityFeeChanged',
    recurrence_on: 'activityRecurrenceOn',
    recurrence_off: 'activityRecurrenceOff',
    event_started: 'activityEventStarted',
    score_entered: 'activityScoreEntered',
    score_edited: 'activityScoreEdited',
    match_not_played: 'activityMatchNotPlayed',
    event_finished: 'activityEventFinished',
    results_published: 'activityResultsPublished',
    ranking_changed: 'activityRankingChanged',
    event_cancelled: 'activityEventCancelled',
  };
  if (row.action === 'event_edited') {
    const changes = Array.isArray((row.detail as { changes?: unknown })?.changes)
      ? ((row.detail as { changes: string[] }).changes)
      : [];
    const words = changes.map((c) => t(`activityGroup_${c}` as never)).join(', ');
    const base = t('activityEventEdited', { actor });
    return words ? `${base} (${words})` : base;
  }
  // An action a newer server logs before this build knows it reads neutrally, never as "joined".
  return t(key[row.action] ?? 'activityOther', { actor, target });
}

/** Relative timestamp like "3h ago" / "2d ago" / "just now". */
function ago(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function EventActivityScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rows, isLoading } = useEventActivity(id);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('activityTitle')} onBack={() => router.back()} />
      <FlashList
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, listEmptyContent]}
        ListEmptyComponent={
          <EmptyState
            fill
            icon={emptyIcon('clock')}
            title={t('activityEmpty')}
            body={t('activityEmptyBody')}
            testID="empty-activity"
          />
        }
        renderItem={({ item }) => {
          const actor = item.profiles?.full_name ?? '?';
          return (
            <View style={styles.row}>
              {/* Decorative: the actor's name is part of the line text beside it. */}
              <Avatar
                uri={avatarUrl(item.profiles?.avatar_url)}
                name={actor}
                colourKey={item.profiles?.id ?? item.actor_id}
                size="md"
                decorative
              />
              <View style={styles.rowBody}>
                <Text style={styles.line}>{lineFor(t, item)}</Text>
                <Text style={styles.time}>{ago(item.created_at)}</Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowBody: { flex: 1 },
  line: { fontSize: 15, color: colors.foreground, fontWeight: '500' },
  time: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
});
