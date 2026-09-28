/**
 * Manage players — reached from the event page's "Manage players" row and the dashboard's
 * Confirmed card (UX-MEVT-01/03).
 *
 * INTERIM (M1): today's roster controls, moved here unchanged from the old single-screen Manage —
 * add a player manually, confirm, remove (back to invited or from the event), the invited and
 * waiting lists, and the team builder on a team event. M2 rebuilds this screen as UX-MEVT-10..13
 * (Confirmed / Waiting list / Invited tabs, swipe actions, Invite, Add manually sheet) and M3 the
 * team management. Payments live on their own list (`payments.tsx`), never here: who is coming and
 * who has paid are different lists (UX-MEVT-03).
 */
import {
  useAddManualParticipant,
  useEvent,
  useEventInvitations,
  useEventParticipants,
  useMarkConfirmed,
  useRemoveParticipant,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TeamManage } from '@/components/event/TeamManage';
import { avatarUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
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
} from '../../../components/ui';

/** Display name for a participant row: profile name, then guest name, then dash. */
function rowName(p: { profiles?: { full_name: string | null } | null; guest_name: string | null }): string {
  return p.profiles?.full_name ?? p.guest_name ?? '—';
}

export default function ManagePlayersScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const show = useActionSheet();
  const banner = useBanner();

  const { data: event, isLoading } = useEvent(id);
  const { data: participantsData } = useEventParticipants(id);
  const { data: invitationsData } = useEventInvitations(id);

  const markConfirmed = useMarkConfirmed(id);
  const removeParticipant = useRemoveParticipant(id);
  const addManual = useAddManualParticipant(id);

  const [manualName, setManualName] = useState('');
  const [manualGender, setManualGender] = useState<'male' | 'female' | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  if (event == null || uid == null || uid !== event.organizer_id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} title={t('managePlayersTitle')} />
        <EmptyState fill title={t('forbidden')} testID="manage-players-forbidden" />
      </SafeAreaView>
    );
  }

  const participants = participantsData ?? [];
  const invitations = invitationsData ?? [];
  const confirmed = participants.filter((p) => p.status === 'confirmed' && !p.is_standby);
  const standby = participants.filter((p) => p.is_standby);
  const waiting = participants.filter((p) => p.status === 'waiting_list');
  const isMixed = event.specification === 'mixed';
  const scheduled = event.status === 'scheduled';

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
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
    if (name.length === 0) {
      banner.show(t('manualNameRequired'));
      return;
    }
    void run(async () => {
      await addManual.mutateAsync({ name, gender: isMixed && manualGender != null ? manualGender : undefined });
      setManualName('');
      setManualGender(null);
    });
  };

  const renderRow = (p: (typeof participants)[number]) => {
    const name = rowName(p);
    const target = p.profiles?.full_name ?? p.guest_name ?? undefined;
    return (
      <View key={p.id} style={styles.row}>
        {/* Decorative: the participant's name is right beside it as its own Text node. */}
        <Avatar uri={avatarUrl(p.profiles?.avatar_url)} name={name} colourKey={p.profiles?.id ?? p.user_id} size="sm" decorative />
        <Text variant="body" numberOfLines={1} style={styles.rowName}>
          {name}
        </Text>
        {scheduled ? (
          <View style={styles.rowActions}>
            {p.status !== 'confirmed' ? (
              <Button
                label={t('markConfirmedCta')}
                size="sm"
                variant="secondary"
                disabled={busy}
                onPress={() => onConfirm(p.id, target)}
              />
            ) : null}
            <Button
              label={t('removeCta')}
              size="sm"
              variant="destructive"
              disabled={busy}
              onPress={() => void onRemove(p.id, target)}
            />
          </View>
        ) : null}
      </View>
    );
  };

  const hasRoster = confirmed.length > 0 || invitations.length > 0 || waiting.length > 0 || standby.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('managePlayersTitle')} />

      <Screen scroll padded={false} style={styles.content}>
        {scheduled ? (
          <View style={styles.section}>
            <Text variant="label" tone="muted" style={styles.sectionTitle}>
              {t('addManualCta')}
            </Text>
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
                <Text variant="hint" tone="muted">
                  {t('manualGenderLabel')}
                </Text>
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
            <Button label={t('addManualCta')} fullWidth disabled={busy} onPress={onAddManual} />
          </View>
        ) : null}

        {event.specification === 'team' ? (
          <TeamManage eventId={id} numCourts={event.num_courts} participants={participants} />
        ) : !hasRoster ? (
          <View style={styles.section}>
            <EmptyState
              icon={emptyIcon('person.2')}
              title={t('noRoster')}
              body={t('rosterEmptyBody')}
              action={
                event.group_id != null
                  ? { label: t('rosterEmptyCta'), onPress: () => router.push(`/event/${id}/blast` as Href) }
                  : undefined
              }
              testID="empty-roster"
            />
          </View>
        ) : (
          <>
            {confirmed.length > 0 ? (
              <View style={styles.section}>
                <Text variant="label" tone="muted" style={styles.sectionTitle}>
                  {t('rosterConfirmedSection')}
                </Text>
                {confirmed.map(renderRow)}
              </View>
            ) : null}

            {invitations.length > 0 ? (
              <View style={styles.section}>
                <Text variant="label" tone="muted" style={styles.sectionTitle}>
                  {t('rosterInvitedSection')}
                </Text>
                {invitations.map((inv) => {
                  const name = inv.invitee?.full_name ?? inv.invitee_name ?? '—';
                  return (
                    <View key={inv.id} style={styles.row}>
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
                <Text variant="label" tone="muted" style={styles.sectionTitle}>
                  {t('rosterWaitingSection')}
                </Text>
                {waiting.map(renderRow)}
              </View>
            ) : null}

            {standby.length > 0 ? (
              <View style={styles.section}>
                <Text variant="label" tone="muted" style={styles.sectionTitle}>
                  {t('rosterStandbySection')}
                </Text>
                {standby.map(renderRow)}
              </View>
            ) : null}
          </>
        )}
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: space[10] },
  section: { paddingHorizontal: space[4], paddingTop: space[5] },
  sectionTitle: { textTransform: 'uppercase', marginBottom: space[2] },
  fieldSpacing: { marginBottom: space[2] },
  genderRow: { marginBottom: space[3], gap: space[2] },
  genderOptions: { flexDirection: 'row', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
  rowName: { flex: 1 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
