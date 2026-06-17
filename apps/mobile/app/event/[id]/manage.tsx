import {
  useAddManualParticipant,
  useDuplicateEvent,
  useEvent,
  useEventInvitations,
  useEventParticipants,
  useMarkAllPaid,
  useMarkConfirmed,
  useMarkPaid,
  useRemoveParticipant,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Display name for a participant row: profile name, then guest name, then dash. */
function rowName(p: { profiles?: { full_name: string | null } | null; guest_name: string | null }): string {
  return p.profiles?.full_name ?? p.guest_name ?? '—';
}

export default function EventManageScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  // --- Data ---
  const { data: event, isLoading } = useEvent(id);
  const { data: participantsData } = useEventParticipants(id);
  const { data: invitationsData } = useEventInvitations(id);

  // --- Mutations (all hooks declared before any early return) ---
  const markConfirmed = useMarkConfirmed(id);
  const removeParticipant = useRemoveParticipant(id);
  const addManual = useAddManualParticipant(id);
  const markPaid = useMarkPaid(id);
  const markAllPaid = useMarkAllPaid(id);
  const duplicateEvent = useDuplicateEvent();

  const [manualName, setManualName] = useState('');
  const [manualGender, setManualGender] = useState<'male' | 'female' | null>(null);
  const [busy, setBusy] = useState(false);

  // --- Loading ---
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
      </SafeAreaView>
    );
  }

  // --- Organizer guard: no event (RLS) or not the organizer -> back out. ---
  const isOrganizer = event != null && uid != null && uid === event.organizer_id;
  if (event == null || !isOrganizer) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <View style={styles.guard}>
          <Text style={styles.guardTitle}>{t('forbidden')}</Text>
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

  const participants = participantsData ?? [];
  const invitations = invitationsData ?? [];

  // --- Header stats ---
  const capacity = event.num_courts * 4;
  const confirmed = participants.filter((p) => p.status === 'confirmed' && !p.is_standby);
  const standby = participants.filter((p) => p.is_standby);
  const waiting = participants.filter((p) => p.status === 'waiting_list');
  const paidCount = participants.filter((p) => p.has_paid).length;
  const feeEnabled = event.entrance_fee_enabled;
  const isMixed = event.specification === 'mixed';

  // --- Action wrapper (serialises mutations + surfaces errors via Alert) ---
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      Alert.alert(t(code));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = (participantId: string, targetName?: string) =>
    run(() => markConfirmed.mutateAsync({ participantId, targetName }));

  const onRemove = (participantId: string, targetName?: string) => {
    Alert.alert(t('removeConfirmTitle'), t('removeConfirmBody'), [
      {
        text: t('removeToInvitedCta'),
        onPress: () =>
          run(() =>
            removeParticipant.mutateAsync({ participantId, mode: 'to_invited', targetName }),
          ),
      },
      {
        text: t('removeFromEventCta'),
        style: 'destructive',
        onPress: () =>
          run(() =>
            removeParticipant.mutateAsync({ participantId, mode: 'from_event', targetName }),
          ),
      },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const onAddManual = () => {
    const name = manualName.trim();
    if (name.length === 0) return;
    void run(async () => {
      await addManual.mutateAsync({
        name,
        gender: isMixed && manualGender != null ? manualGender : undefined,
      });
      setManualName('');
      setManualGender(null);
    });
  };

  const onTogglePaid = (participantId: string, paid: boolean, targetName?: string) =>
    run(() => markPaid.mutateAsync({ participantId, paid, targetName }));

  const onMarkAllPaid = () => run(() => markAllPaid.mutateAsync());

  const onDuplicate = () =>
    run(async () => {
      const newId = await duplicateEvent.mutateAsync({
        eventId: id,
        groupId: event.group_id,
      });
      if (typeof newId === 'string') {
        router.replace(`/event/${newId}` as Href);
      }
    });

  // --- A single roster row (confirm + remove + optional paid toggle). ---
  const renderRow = (p: (typeof participants)[number]) => {
    const name = rowName(p);
    const showConfirm = p.status !== 'confirmed';
    return (
      <View key={p.id} style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{(name.charAt(0) || '?').toUpperCase()}</Text>
        </View>
        <Text style={styles.rowName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.rowActions}>
          {feeEnabled ? (
            <Pressable
              style={[styles.pill, p.has_paid ? styles.pillPaid : styles.pillUnpaid]}
              accessibilityRole="button"
              disabled={busy}
              onPress={() =>
                onTogglePaid(p.id, !p.has_paid, p.profiles?.full_name ?? p.guest_name ?? undefined)
              }
            >
              <Text style={[styles.pillText, p.has_paid ? styles.pillTextPaid : styles.pillTextUnpaid]}>
                {p.has_paid ? t('paidBadge') : t('unpaidBadge')}
              </Text>
            </Pressable>
          ) : null}
          {showConfirm ? (
            <Pressable
              style={[styles.smallBtn, styles.confirmBtn]}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onConfirm(p.id, p.profiles?.full_name ?? p.guest_name ?? undefined)}
            >
              <Text style={styles.confirmLabel}>{t('markConfirmedCta')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.smallBtn, styles.removeBtn]}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onRemove(p.id, p.profiles?.full_name ?? p.guest_name ?? undefined)}
          >
            <Text style={styles.removeLabel}>{t('removeCta')}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const hasRoster =
    confirmed.length > 0 || invitations.length > 0 || waiting.length > 0 || standby.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {t('manageTitle')}
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Header stats */}
        <View style={styles.stats}>
          <Text style={styles.statLine}>
            {t('statConfirmed', { confirmed: confirmed.length, capacity })}
          </Text>
          {feeEnabled ? (
            <Text style={styles.statLine}>
              {t('statPaid', { paid: paidCount, total: participants.length })}
            </Text>
          ) : null}
        </View>

        {/* TODO(Phase 6f): wire up edit-event + cancel-event organizer actions. */}

        {/* Add player manually */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('addManualCta')}</Text>
          <TextInput
            style={styles.input}
            value={manualName}
            onChangeText={setManualName}
            placeholder={t('manualNameLabel')}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {isMixed ? (
            <View style={styles.genderRow}>
              <Text style={styles.genderLabel}>{t('manualGenderLabel')}</Text>
              <View style={styles.genderOptions}>
                {(['male', 'female'] as const).map((g) => (
                  <Pressable
                    key={g}
                    style={[styles.genderPill, manualGender === g ? styles.genderPillActive : null]}
                    accessibilityRole="button"
                    onPress={() => setManualGender(g)}
                  >
                    <Text
                      style={[
                        styles.genderPillText,
                        manualGender === g ? styles.genderPillTextActive : null,
                      ]}
                    >
                      {t(g === 'male' ? 'genderMale' : 'genderFemale')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <Pressable
            style={[styles.btn, styles.primaryBtn, manualName.trim().length === 0 ? styles.btnDisabled : null]}
            accessibilityRole="button"
            disabled={busy || manualName.trim().length === 0}
            onPress={onAddManual}
          >
            <Text style={styles.primaryLabel}>{t('addManualCta')}</Text>
          </Pressable>
        </View>

        {/* Roster */}
        {!hasRoster ? (
          <View style={styles.section}>
            <Text style={styles.empty}>{t('noRoster')}</Text>
          </View>
        ) : (
          <>
            {confirmed.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{t('rosterConfirmedSection')}</Text>
                  {feeEnabled ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={onMarkAllPaid}
                    >
                      <Text style={styles.linkAction}>{t('markAllPaidCta')}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {confirmed.map(renderRow)}
              </View>
            ) : null}

            {invitations.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('rosterInvitedSection')}</Text>
                {invitations.map((inv) => {
                  const name = inv.invitee?.full_name ?? inv.invitee_name ?? '—';
                  return (
                    <View key={inv.id} style={styles.row}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarInitial}>
                          {(name.charAt(0) || '?').toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {name}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {waiting.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('rosterWaitingSection')}</Text>
                {waiting.map(renderRow)}
              </View>
            ) : null}

            {standby.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('rosterStandbySection')}</Text>
                {standby.map(renderRow)}
              </View>
            ) : null}
          </>
        )}

        {/* Activity log */}
        <View style={styles.section}>
          <Pressable
            style={[styles.btn, styles.secondaryBtn]}
            accessibilityRole="button"
            onPress={() => router.push(`/event/${id}/activity` as never)}
          >
            <Text style={styles.secondaryLabel}>{t('activityLogCta')}</Text>
          </Pressable>
        </View>

        {/* Duplicate */}
        <View style={styles.section}>
          <Pressable
            style={[styles.btn, styles.secondaryBtn]}
            accessibilityRole="button"
            disabled={busy}
            onPress={onDuplicate}
          >
            <Text style={styles.secondaryLabel}>{t('duplicateCta')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { alignItems: 'center', justifyContent: 'center' },

  // Guard
  guard: { paddingHorizontal: 32, alignItems: 'center', gap: 16 },
  guardTitle: { fontSize: 18, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  back: { fontSize: 32, color: '#0B1F3A', lineHeight: 32, width: 32 },
  topTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  topSpacer: { width: 32 },
  content: { paddingBottom: 40 },

  // Stats
  stats: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 16, gap: 4 },
  statLine: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },

  // Sections
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A95A5',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  linkAction: { fontSize: 14, fontWeight: '700', color: '#0B7BFF', marginBottom: 8 },
  empty: { fontSize: 15, color: '#6B7685' },

  // Input
  input: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6EAF0',
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0B1F3A',
    marginBottom: 12,
  },

  // Gender selector
  genderRow: { marginBottom: 12, gap: 8 },
  genderLabel: { fontSize: 13, fontWeight: '600', color: '#6B7685' },
  genderOptions: { flexDirection: 'row', gap: 8 },
  genderPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6EAF0',
  },
  genderPillActive: { backgroundColor: '#0B7BFF', borderColor: '#0B7BFF' },
  genderPillText: { fontSize: 14, fontWeight: '600', color: '#0B1F3A' },
  genderPillTextActive: { color: '#fff' },

  // Roster rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0B1F3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rowName: { flex: 1, fontSize: 15, color: '#0B1F3A', fontWeight: '500' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Paid pill
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillPaid: { backgroundColor: '#E3F5EA' },
  pillUnpaid: { backgroundColor: '#FCEBEC' },
  pillText: { fontSize: 12, fontWeight: '700' },
  pillTextPaid: { color: '#1A7F4B' },
  pillTextUnpaid: { color: '#D7263D' },

  // Small action buttons
  smallBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  confirmBtn: { backgroundColor: '#0B7BFF' },
  confirmLabel: { fontSize: 13, fontWeight: '700', color: '#fff' },
  removeBtn: { backgroundColor: '#F0F3F8' },
  removeLabel: { fontSize: 13, fontWeight: '600', color: '#D7263D' },

  // Buttons
  btn: {
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtn: { backgroundColor: '#0B7BFF' },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryBtn: { backgroundColor: '#F0F3F8' },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
});
