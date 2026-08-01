import {
  useAcceptPartnerRequest,
  useDeclinePartnerRequest,
  useEvent,
  useEventParticipants,
  useGroupMembers,
  usePartnerRequests,
  useRequestPartner,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, palette } from '../../../theme';

type Runner = (fn: () => Promise<unknown>) => void;

export default function PartnerRequestsScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: event, isLoading } = useEvent(id);
  const { data: requestsData } = usePartnerRequests(id);
  const { data: participantsData } = useEventParticipants(id);

  const requestPartner = useRequestPartner(id);
  const acceptRequest = useAcceptPartnerRequest(id);
  const declineRequest = useDeclinePartnerRequest(id);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run: Runner = (fn) => {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'unknown_error');
      } finally {
        setBusy(false);
      }
    })();
  };

  // --- Loading ---
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  // --- No access (RLS hid the row -> data is null) ---
  if (event == null) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <View style={styles.noAccess}>
          <Text style={styles.noAccessTitle}>{t('noAccessTitle')}</Text>
          <Text style={styles.noAccessBody}>{t('noAccessBody')}</Text>
          <Pressable
            style={[styles.btn, styles.secondaryBtn]}
            accessibilityRole="button"
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryLabel}>{t('back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const requests = requestsData ?? [];
  const participants = participantsData ?? [];
  const groupId = event.group_id;

  const incoming = requests.filter((r) => r.target_id === uid && r.status === 'pending');
  const outgoing = requests.filter((r) => r.requester_id === uid && r.status === 'pending');

  // user_ids that are off-limits as candidates: already confirmed, or already requested.
  const confirmedIds = new Set(
    participants
      .filter((p) => p.status === 'confirmed' && p.user_id != null)
      .map((p) => p.user_id as string),
  );
  const pendingTargetIds = new Set(outgoing.map((r) => r.target_id));

  const onAccept = (requestId: string) =>
    run(() => acceptRequest.mutateAsync(requestId));
  const onDecline = (requestId: string) =>
    run(() => declineRequest.mutateAsync(requestId));
  const onRequest = (target: string) =>
    run(() => requestPartner.mutateAsync([target]));

  const hasGroup = groupId != null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>{t('partnerRequestsTitle')}</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error != null ? <Text style={styles.error}>{t(error)}</Text> : null}

        {/* Incoming */}
        {incoming.length > 0 ? (
          <View style={styles.section}>
            {incoming.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardText}>
                  {t('partnerIncoming', { name: r.requester?.full_name ?? '—' })}
                </Text>
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.btn, styles.secondaryBtn, styles.btnFlex]}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => onDecline(r.id)}
                  >
                    <Text style={styles.secondaryLabel}>{t('declineCta')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.primaryBtn, styles.btnFlex]}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => onAccept(r.id)}
                  >
                    <Text style={styles.primaryLabel}>{t('acceptCta')}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Outgoing (pending) */}
        {outgoing.length > 0 ? (
          <View style={styles.section}>
            {outgoing.map((r) => (
              <View key={r.id} style={styles.row}>
                <Text style={styles.rowName}>{r.target?.full_name ?? '—'}</Text>
                <Text style={styles.pendingLabel}>{t('partnerRequestPending')}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Choose a partner (group events only) */}
        {hasGroup ? (
          <CandidateList
            groupId={groupId}
            uid={uid}
            confirmedIds={confirmedIds}
            pendingTargetIds={pendingTargetIds}
            busy={busy}
            onRequest={onRequest}
          />
        ) : null}

        {/* Empty state */}
        {incoming.length === 0 && outgoing.length === 0 && !hasGroup ? (
          <Text style={styles.emptyText}>{t('noPartnerRequests')}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Renders the candidate-partner section. Isolated so `useGroupMembers` is only
 * ever called when the event has a group (keeps the hook unconditional).
 */
function CandidateList({
  groupId,
  uid,
  confirmedIds,
  pendingTargetIds,
  busy,
  onRequest,
}: {
  groupId: string;
  uid: string | undefined;
  confirmedIds: Set<string>;
  pendingTargetIds: Set<string>;
  busy: boolean;
  onRequest: (target: string) => void;
}) {
  const { t } = useT('event');
  const { data: membersData } = useGroupMembers(groupId);

  const members = membersData ?? [];
  const candidates = members.filter(
    (m) =>
      m.user_id !== uid &&
      !confirmedIds.has(m.user_id) &&
      !pendingTargetIds.has(m.user_id),
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('choosePartnerTitle')}</Text>
      {candidates.length === 0 ? (
        <Text style={styles.emptyText}>{t('noPartnerRequests')}</Text>
      ) : null}
      {candidates.map((m) => (
        <View key={m.user_id} style={styles.row}>
          <Text style={styles.rowName}>{m.profiles?.full_name ?? '—'}</Text>
          <Pressable
            style={[styles.btn, styles.secondaryBtn, styles.btnSmall]}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onRequest(m.user_id)}
          >
            <Text style={styles.secondaryLabel}>{t('requestPartnerCta')}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  back: { fontSize: 32, color: colors.foreground, lineHeight: 32 },
  topTitle: { fontSize: 17, fontWeight: '700', color: colors.foreground },
  topSpacer: { width: 24 },
  content: { paddingBottom: 32, paddingHorizontal: 16, paddingTop: 8 },

  // No-access
  noAccess: { paddingHorizontal: 32, alignItems: 'center', gap: 12 },
  noAccessTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  noAccessBody: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center' },

  // Sections
  section: { paddingTop: 20, gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.slate[400],
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  // Incoming card
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  cardText: { fontSize: 15, color: colors.foreground, fontWeight: '500' },
  actionRow: { flexDirection: 'row', gap: 12 },

  // Generic rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowName: { flex: 1, fontSize: 15, color: colors.foreground, fontWeight: '500' },
  pendingLabel: { fontSize: 14, color: colors.mutedForeground, fontWeight: '600' },

  emptyText: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center', marginTop: 32 },
  error: { fontSize: 14, fontWeight: '600', color: colors.destructive, marginTop: 12, textAlign: 'center' },

  // Buttons
  btn: {
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFlex: { flex: 1 },
  btnSmall: { minHeight: 40, paddingHorizontal: 16 },
  primaryBtn: { backgroundColor: colors.primary },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: colors.card },
  secondaryBtn: { backgroundColor: colors.muted },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: colors.foreground },
});
