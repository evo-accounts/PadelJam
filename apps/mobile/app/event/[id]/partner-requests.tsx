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
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, palette } from '../../../theme';
import { Avatar, Button, EmptyState, emptyIcon, Text, TopBar } from '../../../components/ui';
import { avatarUrl } from '@/lib/community-images';

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
          <Text variant="sectionTitle" style={styles.noAccessTitle}>{t('noAccessTitle')}</Text>
          <Text variant="body" tone="muted" style={styles.noAccessBody}>{t('noAccessBody')}</Text>
          <Button label={t('back')} variant="outline" onPress={() => router.back()} />
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
      <TopBar title={t('partnerRequestsTitle')} onBack={() => router.back()} backLabel={t('back')} />

      <ScrollView contentContainerStyle={styles.content}>
        {error != null ? <Text variant="label" tone="destructive" style={styles.error}>{t(error)}</Text> : null}

        {/* Incoming */}
        {incoming.length > 0 ? (
          <View style={styles.section}>
            {incoming.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.requestRow}>
                  {/* Decorative: the requester's name is already part of the sentence beside it. */}
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Avatar
                      uri={avatarUrl(r.requester?.avatar_url)}
                      name={r.requester?.full_name}
                      colourKey={r.requester?.id ?? r.requester_id}
                      size="sm"
                    />
                  </View>
                  <Text variant="body" style={styles.requestText}>
                    {t('partnerIncoming', { name: r.requester?.full_name ?? '—' })}
                  </Text>
                </View>
                <View style={styles.actionRow}>
                  <Button label={t('declineCta')} variant="outline" size="sm" disabled={busy} onPress={() => onDecline(r.id)} />
                  <Button label={t('acceptCta')} size="sm" disabled={busy} onPress={() => onAccept(r.id)} />
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
                <View style={styles.requestRow}>
                  {/* Decorative: the target's name is right beside it as its own Text node. */}
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Avatar
                      uri={avatarUrl(r.target?.avatar_url)}
                      name={r.target?.full_name}
                      colourKey={r.target?.id ?? r.target_id}
                      size="sm"
                    />
                  </View>
                  <Text variant="body">{r.target?.full_name ?? '—'}</Text>
                </View>
                <Text variant="hint" tone="muted">{t('partnerRequestPending')}</Text>
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
          <EmptyState
            icon={emptyIcon('person.badge.clock')}
            title={t('noPartnerRequests')}
            testID="empty-partner-requests"
          />
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
        <EmptyState
          icon={emptyIcon('person.badge.clock')}
          title={t('noPartnerRequests')}
          testID="empty-partner-candidates"
        />
      ) : null}
      {candidates.map((m) => (
        <View key={m.user_id} style={styles.row}>
          <View style={styles.requestRow}>
            {/* Decorative: the candidate's name is right beside it as its own Text node. */}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Avatar
                uri={avatarUrl(m.profiles?.avatar_url)}
                name={m.profiles?.full_name}
                colourKey={m.profiles?.id ?? m.user_id}
                size="sm"
              />
            </View>
            <Text variant="body">{m.profiles?.full_name ?? '—'}</Text>
          </View>
          <Button
            label={t('requestPartnerCta')}
            variant="outline"
            size="sm"
            disabled={busy}
            onPress={() => onRequest(m.user_id)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
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
  actionRow: { flexDirection: 'row', gap: 12 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  requestText: { flex: 1 },

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

  error: { fontSize: 14, fontWeight: '600', color: colors.destructive, marginTop: 12, textAlign: 'center' },

  // Buttons
});
