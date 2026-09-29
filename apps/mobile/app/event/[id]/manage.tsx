import {
  useAddManualParticipant,
  useCancelEvent,
  useDuplicateEvent,
  useEvent,
  useEventInvitations,
  useEventParticipants,
  useMarkAllPaid,
  useMarkConfirmed,
  useMarkPaid,
  useRemoveParticipant,
  useSendRosterCsvEmail,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { buildRosterCsv, nextFutureWeekly, rosterCsvFilename } from '@padel/utils';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TeamManage } from '@/components/event/TeamManage';
import { avatarUrl } from '@/lib/community-images';
import { colors, palette } from '../../../theme';
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  emptyIcon,
  Field,
  Screen,
  Text,
  TopBar,
  useActionSheet,
  useBanner,
  useConfirm,
} from '../../../components/ui';

/** Display name for a participant row: profile name, then guest name, then dash. */
function rowName(p: { profiles?: { full_name: string | null } | null; guest_name: string | null }): string {
  return p.profiles?.full_name ?? p.guest_name ?? '—';
}

export default function EventManageScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const confirm = useConfirm();
  const show = useActionSheet();
  const banner = useBanner();

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
  const cancelEvent = useCancelEvent(id);
  const sendCsvEmail = useSendRosterCsvEmail(id);

  const [manualName, setManualName] = useState('');
  const [manualGender, setManualGender] = useState<'male' | 'female' | null>(null);
  const [busy, setBusy] = useState(false);

  // --- Loading ---
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  // --- Organizer guard: no event (RLS) or not the organizer -> back out. ---
  const isOrganizer = event != null && uid != null && uid === event.organizer_id;
  if (event == null || !isOrganizer) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <View style={styles.guard}>
          <Text variant="sectionTitle" style={styles.guardTitle}>{t('forbidden')}</Text>
          <Button label={t('back')} variant="secondary" onPress={() => router.back()} />
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

  // --- Action wrapper (serialises mutations + surfaces errors via the banner) ---
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(code));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = (participantId: string, targetName?: string) =>
    run(() => markConfirmed.mutateAsync({ participantId, targetName }));

  const onRemove = async (participantId: string, targetName?: string) => {
    const key = await show({
      title: t('removeConfirmTitle'),
      actions: [
        { key: 'to_invited', label: t('removeToInvitedCta') },
        {
          key: 'from_event',
          label: t('removeFromEventCta'),
          destructive: true,
          confirm: { title: t('removeConfirmTitle'), body: t('removeConfirmBody'), confirmLabel: t('removeFromEventCta') },
        },
      ],
    });
    if (key === 'to_invited' || key === 'from_event') {
      void run(() => removeParticipant.mutateAsync({ participantId, mode: key, targetName }));
    }
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
      // starts_at is required and must be in the future (0122, B8). Until the Duplicate sheet
      // (plan M1) lets the organizer pick it, the copy takes the next weekly slot.
      const newId = await duplicateEvent.mutateAsync({
        eventId: id,
        groupId: event.group_id,
        overrides: { starts_at: nextFutureWeekly(new Date(event.starts_at)).toISOString() },
      });
      if (typeof newId === 'string') {
        router.replace(`/event/${newId}` as Href);
      }
    });

  const onExportCsv = () =>
    run(async () => {
      const csv = buildRosterCsv(participants, {
        entrance_fee_enabled: event.entrance_fee_enabled,
        entrance_fee_amount: event.entrance_fee_amount,
      });
      const filename = rosterCsvFilename(event.name, new Date().toISOString().slice(0, 10));
      const uri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(uri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: filename });
      } else {
        await Clipboard.setStringAsync(csv);
        banner.show(t('exportUnavailable'));
      }
    });

  const onExport = async () => {
    const key = await show({
      title: t('exportSheetTitle'),
      actions: [
        { key: 'csv', label: t('exportCsvCta') },
        { key: 'email', label: t('emailCsvCta') },
      ],
    });
    if (key === 'csv') {
      void onExportCsv();
    } else if (key === 'email') {
      void run(async () => {
        await sendCsvEmail.mutateAsync();
        banner.show(t('csvEmailed'), 'success');
      });
    }
  };

  const doCancel = (scope: 'only_this' | 'this_and_upcoming') =>
    run(async () => {
      await cancelEvent.mutateAsync({ scope });
      router.back();
    });

  const onCancelEvent = async () => {
    if (event.series_id != null) {
      const key = await show({
        title: t('cancelRecurringTitle'),
        actions: [
          {
            key: 'only_this',
            label: t('cancelOnlyThisCta'),
            destructive: true,
            confirm: { title: t('cancelRecurringTitle'), confirmLabel: t('cancelOnlyThisCta') },
          },
          {
            key: 'this_and_upcoming',
            label: t('cancelThisAndUpcomingCta'),
            destructive: true,
            confirm: { title: t('cancelRecurringTitle'), confirmLabel: t('cancelThisAndUpcomingCta') },
          },
        ],
      });
      if (key === 'only_this' || key === 'this_and_upcoming') {
        void doCancel(key);
      }
    } else if (
      await confirm({
        title: t('cancelStandardTitle'),
        body: t('cancelStandardBody'),
        confirmLabel: t('cancelEventCta'),
        destructive: true,
      })
    ) {
      void doCancel('only_this');
    }
  };

  // --- A single roster row (confirm + remove + optional paid toggle). ---
  const renderRow = (p: (typeof participants)[number]) => {
    const name = rowName(p);
    const showConfirm = p.status !== 'confirmed';
    return (
      <View key={p.id} style={styles.row}>
        {/* Decorative: the participant's name is right beside it as its own Text node. */}
        <Avatar
          uri={avatarUrl(p.profiles?.avatar_url)}
          name={name}
          colourKey={p.profiles?.id ?? p.user_id}
          size="sm"
          decorative
        />
        <Text variant="body" numberOfLines={1} style={styles.rowName}>
          {name}
        </Text>
        <View style={styles.rowActions}>
          {feeEnabled ? (
            <Chip
              label={p.has_paid ? t('paidBadge') : t('unpaidBadge')}
              selected={p.has_paid}
              disabled={busy}
              onPress={() =>
                onTogglePaid(p.id, !p.has_paid, p.profiles?.full_name ?? p.guest_name ?? undefined)
              }
            />
          ) : null}
          {showConfirm ? (
            <Button
              label={t('markConfirmedCta')}
              size="sm"
              variant="secondary"
              disabled={busy}
              onPress={() => onConfirm(p.id, p.profiles?.full_name ?? p.guest_name ?? undefined)}
            />
          ) : null}
          <Button
            label={t('removeCta')}
            size="sm"
            variant="destructive"
            disabled={busy}
            onPress={() => onRemove(p.id, p.profiles?.full_name ?? p.guest_name ?? undefined)}
          />
        </View>
      </View>
    );
  };

  const hasRoster =
    confirmed.length > 0 || invitations.length > 0 || waiting.length > 0 || standby.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('manageTitle')} onBack={() => router.back()} backLabel={t('back')} />

      <Screen scroll padded={false} style={styles.content}>
        {/* Header stats */}
        <View style={styles.stats}>
          <Text variant="bodyStrong">
            {t('statConfirmed', { confirmed: confirmed.length, capacity })}
          </Text>
          {feeEnabled ? (
            <Text variant="bodyStrong">
              {t('statPaid', { paid: paidCount, total: participants.length })}
            </Text>
          ) : null}
        </View>

        {/* TODO(Phase 6f): edit Location & Courts (deferred). */}
        {event.status === 'scheduled' ? (
          <View style={styles.section}>
            <Button
              label={t('editEventCta')}
              variant="secondary"
              onPress={() => router.push(`/event/${id}/edit` as never)}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Button
            label={t('cancelEventCta')}
            variant="destructive"
            disabled={busy}
            onPress={onCancelEvent}
          />

        </View>

        {/* Add player manually */}
        <View style={styles.section}>
          <Text variant="label" tone="muted" style={styles.sectionTitle}>{t('addManualCta')}</Text>
          <Field
            containerStyle={styles.fieldSpacing}
            value={manualName}
            onChangeText={setManualName}
            placeholder={t('manualNameLabel')}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {isMixed ? (
            <View style={styles.genderRow}>
              <Text variant="hint" tone="muted">{t('manualGenderLabel')}</Text>
              <View style={styles.genderOptions}>
                {(['male', 'female'] as const).map((g) => (
                  <Chip
                    key={g}
                    label={t(g === 'male' ? 'genderMale' : 'genderFemale')}
                    selected={manualGender === g}
                    onPress={() => setManualGender(g)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <Button
            label={t('addManualCta')}
            fullWidth
            disabled={busy || manualName.trim().length === 0}
            onPress={onAddManual}
          />
        </View>

        {/* Roster */}
        {event.specification === 'team' ? (
          <TeamManage eventId={id} numCourts={event.num_courts} participants={participants} />
        ) : !hasRoster ? (
          <View style={styles.section}>
            <EmptyState
              icon={emptyIcon('person.2')}
              title={t('noRoster')}
              body={t('rosterEmptyBody')}
              action={
                isOrganizer
                  ? { label: t('rosterEmptyCta'), onPress: () => router.push(`/event/${id}/blast` as never) }
                  : undefined
              }
              testID="empty-roster"
            />
          </View>
        ) : (
          <>
            {confirmed.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text variant="label" tone="muted" style={styles.sectionTitle}>{t('rosterConfirmedSection')}</Text>
                  {feeEnabled ? (
                    <Button
                      label={t('markAllPaidCta')}
                      variant="tertiary"
                      size="sm"
                      disabled={busy}
                      onPress={onMarkAllPaid}
                    />
                  ) : null}
                </View>
                {confirmed.map(renderRow)}
              </View>
            ) : null}

            {invitations.length > 0 ? (
              <View style={styles.section}>
                <Text variant="label" tone="muted" style={styles.sectionTitle}>{t('rosterInvitedSection')}</Text>
                {invitations.map((inv) => {
                  const name = inv.invitee?.full_name ?? inv.invitee_name ?? '—';
                  return (
                    <View key={inv.id} style={styles.row}>
                      {/* Decorative: the invitee's name is right beside it as its own Text node. */}
                      <Avatar
                        uri={avatarUrl(inv.invitee?.avatar_url)}
                        name={name}
                        colourKey={inv.invitee?.id ?? inv.invitee_id}
                        size="sm"
                        decorative
                      />
                      <Text variant="body" numberOfLines={1} style={styles.rowName}>
                        {name}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {waiting.length > 0 ? (
              <View style={styles.section}>
                <Text variant="label" tone="muted" style={styles.sectionTitle}>{t('rosterWaitingSection')}</Text>
                {waiting.map(renderRow)}
              </View>
            ) : null}

            {standby.length > 0 ? (
              <View style={styles.section}>
                <Text variant="label" tone="muted" style={styles.sectionTitle}>{t('rosterStandbySection')}</Text>
                {standby.map(renderRow)}
              </View>
            ) : null}
          </>
        )}

        {/* Activity log */}
        <View style={styles.section}>
          <Button
            label={t('activityLogCta')}
            variant="secondary"
            onPress={() => router.push(`/event/${id}/activity` as never)}
          />
        </View>

        {/* Send a blast (community events only) */}
        {event.group_id != null ? (
          <View style={styles.section}>
            <Button
              label={t('sendBlastCta')}
              variant="secondary"
              onPress={() => router.push(`/event/${id}/blast` as never)}
            />
          </View>
        ) : null}

        {/* Export attendance CSV */}
        <View style={styles.section}>
          <Button
            label={t('exportCsvCta')}
            variant="secondary"
            onPress={onExport}
          />
        </View>

        {/* Duplicate */}
        <View style={styles.section}>
          <Button
            label={t('duplicateCta')}
            variant="secondary"
            onPress={onDuplicate}
          />
        </View>
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fieldSpacing: { marginBottom: 8 },
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },

  // Guard
  guard: { paddingHorizontal: 32, alignItems: 'center', gap: 16 },
  guardTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, textAlign: 'center' },

  // Top bar
  content: { paddingBottom: 40 },

  // Stats
  stats: { backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 16, gap: 4 },

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
    color: palette.slate[400],
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  // Input

  // Gender selector
  genderRow: { marginBottom: 12, gap: 8 },
  genderOptions: { flexDirection: 'row', gap: 8 },

  // Roster rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  rowName: { flex: 1, fontSize: 15, color: colors.foreground, fontWeight: '500' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Paid pill

  // Small action buttons

  // Buttons
});
