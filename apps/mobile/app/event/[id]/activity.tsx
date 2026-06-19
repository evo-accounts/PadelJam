import { useEventActivity, type ActivityRow } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  };
  if (row.action === 'event_edited') {
    const changes = Array.isArray((row.detail as { changes?: unknown })?.changes)
      ? ((row.detail as { changes: string[] }).changes)
      : [];
    const words = changes.map((c) => t(`activityGroup_${c}` as never)).join(', ');
    const base = t('activityEventEdited', { actor });
    return words ? `${base} (${words})` : base;
  }
  return t(key[row.action] ?? 'activityJoined', { actor, target });
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rows, isLoading } = useEventActivity(id);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>{t('activityTitle')}</Text>
      {(rows ?? []).length === 0 ? (
        <Text style={styles.empty}>{t('activityEmpty')}</Text>
      ) : (
        <FlashList
          data={rows ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const actor = item.profiles?.full_name ?? '?';
            return (
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{(actor.charAt(0) || '?').toUpperCase()}</Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.line}>{lineFor(t, item)}</Text>
                  <Text style={styles.time}>{ago(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#0B1F3A', padding: 16 },
  empty: { textAlign: 'center', marginTop: 48, color: '#6B7685', fontSize: 15 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#0B1F3A',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rowBody: { flex: 1 },
  line: { fontSize: 15, color: '#0B1F3A', fontWeight: '500' },
  time: { fontSize: 13, color: '#6B7685', marginTop: 2 },
});
