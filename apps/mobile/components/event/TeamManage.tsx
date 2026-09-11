import {
  useAssignToTeam,
  useEventTeams,
  useRemoveFromTeam,
  useRemoveParticipant,
  useSwitchPlayers,
  type TeamRow,
  type TeamSlotPlayer,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, palette } from '../../theme';
import { Button, Chip, ListRow } from '../../components/ui';

type Participant = {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  status: string;
  is_standby: boolean;
  profiles?: { full_name: string | null } | null;
};

type Slot = 'a' | 'b';

function pname(p: { profiles?: { full_name: string | null } | null; guest_name: string | null } | null): string {
  if (!p) return '';
  return p.profiles?.full_name ?? p.guest_name ?? '—';
}

export function TeamManage({
  eventId,
  numCourts,
  participants,
}: {
  eventId: string;
  numCourts: number;
  participants: Participant[];
}) {
  const { t } = useT('event');
  const { data: teams, isLoading } = useEventTeams(eventId);
  const assign = useAssignToTeam(eventId);
  const removeFromTeam = useRemoveFromTeam(eventId);
  const switchPlayers = useSwitchPlayers(eventId);
  const removeParticipant = useRemoveParticipant(eventId);

  const [view, setView] = useState<'team' | 'player'>('team');
  const [busy, setBusy] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ teamNumber: number; slot: Slot } | null>(null);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<
    { participant: Participant; teamNumber: number; slot: Slot } | null
  >(null);

  const capacity = numCourts * 4;
  const teamCount = numCourts * 2;
  const teamRows = teams ?? [];
  const teamByNumber = (n: number): TeamRow | undefined => teamRows.find((r) => r.team_number === n);

  // participant ids currently occupying any slot
  const occupied = new Set<string>();
  teamRows.forEach((r) => {
    if (r.player_a) occupied.add(r.player_a.id);
    if (r.player_b) occupied.add(r.player_b.id);
  });

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      Alert.alert(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setBusy(false);
    }
  };

  const doAssign = (p: Participant, teamNumber: number, slot: Slot) => {
    setAssignTarget(null);
    setConfirmTarget(null);
    void run(() =>
      assign.mutateAsync({ participantId: p.id, teamNumber, slot, targetName: pname(p) }),
    );
  };

  const onPickForSlot = (p: Participant) => {
    if (!assignTarget) return;
    if (p.status !== 'confirmed') {
      setConfirmTarget({ participant: p, teamNumber: assignTarget.teamNumber, slot: assignTarget.slot });
      setAssignTarget(null);
    } else {
      doAssign(p, assignTarget.teamNumber, assignTarget.slot);
    }
  };

  const onSlotPress = (teamNumber: number, slot: Slot, occupant: TeamSlotPlayer | null) => {
    if (busy) return;
    if (!occupant) {
      setAssignTarget({ teamNumber, slot });
      return;
    }
    Alert.alert(t('slotActionTitle'), pname(occupant), [
      { text: t('switchPlayerCta'), onPress: () => setSwitchTarget(occupant.id) },
      {
        text: t('removeFromTeamCta'),
        style: 'destructive',
        onPress: () => run(() => removeFromTeam.mutateAsync({ participantId: occupant.id, targetName: pname(occupant) })),
      },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const onSwitchPick = (other: Participant) => {
    const a = switchTarget;
    setSwitchTarget(null);
    if (a && a !== other.id) {
      void run(() => switchPlayers.mutateAsync({ participantA: a, participantB: other.id }));
    }
  };

  if (isLoading) return <ActivityIndicator color={colors.foreground} style={{ marginTop: 24 }} />;

  const assignable = participants.filter((p) => !occupied.has(p.id));
  const confirmedCount = participants.filter((p) => p.status === 'confirmed' && !p.is_standby).length;

  return (
    <View>
      {/* View toggle */}
      <View style={styles.toggle}>
        {(['team', 'player'] as const).map((v) => (
          <Chip
            key={v}
            label={t(v === 'team' ? 'teamViewTab' : 'playerViewTab')}
            selected={view === v}
            onPress={() => setView(v)}
          />
        ))}
      </View>

      {view === 'team' ? (
        <View style={styles.grid}>
          {Array.from({ length: teamCount }, (_, i) => i + 1).map((n) => {
            const row = teamByNumber(n);
            const unpaired = !!row && (!!row.player_a !== !!row.player_b);
            return (
              <View key={n} style={styles.teamBlock}>
                <View style={styles.teamHeader}>
                  <Text style={styles.teamTitle}>{t('teamLabel', { n })}</Text>
                  {unpaired ? <Text style={styles.unpaired}>{t('teamUnpaired')}</Text> : null}
                </View>
                {(['a', 'b'] as const).map((slot) => {
                  const occ = slot === 'a' ? (row?.player_a ?? null) : (row?.player_b ?? null);
                  return (
                    <Pressable
                      key={slot}
                      style={[styles.slot, occ ? styles.slotFilled : styles.slotEmpty]}
                      onPress={() => onSlotPress(n, slot, occ)}
                      accessibilityRole="button"
                      disabled={busy}
                    >
                      <Text style={occ ? styles.slotName : styles.slotEmptyText}>
                        {occ ? pname(occ) : t('teamSlotEmpty')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      ) : (
        <PlayerView
          t={t}
          participants={participants}
          confirmedCount={confirmedCount}
          capacity={capacity}
          busy={busy}
          onRemove={(p) =>
            run(() => removeParticipant.mutateAsync({ participantId: p.id, mode: 'from_event', targetName: pname(p) }))
          }
        />
      )}

      {/* Assign sheet. The backdrop is deliberately not an accessibility
          element — a default-accessible Pressable around the sheet turns the
          whole modal into one VoiceOver node and hides every row inside it. The
          sheet claims the responder so taps inside stay inside; the Close row is
          how assistive tech leaves. */}
      <Modal visible={assignTarget != null} transparent animationType="slide" onRequestClose={() => setAssignTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setAssignTarget(null)} accessible={false}>
          <View style={styles.sheet} accessibilityViewIsModal onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>{t('assignTitle')}</Text>
            {assignable.length === 0 ? (
              <Text style={styles.sheetEmpty}>{t('assignNoneEligible')}</Text>
            ) : (
              <ScrollView>
                {assignable.map((p) => (
                  <ListRow key={p.id} title={pname(p)} onPress={() => onPickForSlot(p)} />
                ))}
              </ScrollView>
            )}
            <ListRow title={t('close')} onPress={() => setAssignTarget(null)} testID="team-assign-close" />
          </View>
        </Pressable>
      </Modal>

      {/* Switch sheet — same shape and the same reasoning as the assign sheet. */}
      <Modal visible={switchTarget != null} transparent animationType="slide" onRequestClose={() => setSwitchTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSwitchTarget(null)} accessible={false}>
          <View style={styles.sheet} accessibilityViewIsModal onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>{t('switchTitle')}</Text>
            <ScrollView>
              {participants
                .filter((p) => p.id !== switchTarget)
                .map((p) => (
                  <ListRow key={p.id} title={pname(p)} onPress={() => onSwitchPick(p)} />
                ))}
            </ScrollView>
            <ListRow title={t('close')} onPress={() => setSwitchTarget(null)} testID="team-switch-close" />
          </View>
        </Pressable>
      </Modal>

      {/* Confirm-player modal (JM-30) */}
      <Modal visible={confirmTarget != null} transparent animationType="fade" onRequestClose={() => setConfirmTarget(null)}>
        <View style={styles.backdropCenter}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('assignConfirmTitle')}</Text>
            <Text style={styles.dialogBody}>
              {t('assignConfirmBody', { name: confirmTarget ? pname(confirmTarget.participant) : '' })}
            </Text>
            <View style={styles.dialogRow}>
              <Button
                label={t('cancel')}
                variant="outline"
                style={styles.dialogBtn}
                onPress={() => setConfirmTarget(null)}
              />
              <Button
                label={t('continue')}
                style={styles.dialogBtn}
                onPress={() =>
                  confirmTarget && doAssign(confirmTarget.participant, confirmTarget.teamNumber, confirmTarget.slot)
                }
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PlayerView({
  t,
  participants,
  confirmedCount,
  capacity,
  busy,
  onRemove,
}: {
  t: (k: string, o?: Record<string, unknown>) => string;
  participants: Participant[];
  confirmedCount: number;
  capacity: number;
  busy: boolean;
  onRemove: (p: Participant) => void;
}) {
  const [tab, setTab] = useState<'confirmed' | 'interested' | 'invited'>('confirmed');
  const groups = {
    confirmed: participants.filter((p) => p.status === 'confirmed'),
    interested: participants.filter((p) => p.status === 'interested'),
    invited: participants.filter((p) => p.status === 'invited'),
  };
  const tabs: { key: 'confirmed' | 'interested' | 'invited'; label: string }[] = [
    { key: 'confirmed', label: t('teamConfirmedCount', { confirmed: confirmedCount, capacity }) },
    { key: 'interested', label: `${t('interestedTab')} (${groups.interested.length})` },
    { key: 'invited', label: `${t('rosterInvitedSection')} (${groups.invited.length})` },
  ];
  return (
    <View>
      <View style={styles.tabs}>
        {tabs.map((tb) => (
          <Chip key={tb.key} label={tb.label} selected={tab === tb.key} onPress={() => setTab(tb.key)} />
        ))}
      </View>
      {groups[tab].map((p) => (
        <View key={p.id} style={styles.pvRow}>
          <Text style={styles.pvName} numberOfLines={1}>{pname(p)}</Text>
          <Button
            label={t('removeCta')}
            variant="destructive"
            size="sm"
            disabled={busy}
            onPress={() => onRemove(p)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', backgroundColor: colors.accent, borderRadius: 10, padding: 3, marginHorizontal: 16, marginTop: 16 },

  grid: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  teamBlock: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 8 },
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
  unpaired: { fontSize: 12, fontWeight: '600', color: palette.yellow[800] },
  slot: { minHeight: 44, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12 },
  slotFilled: { backgroundColor: palette.purple[100] },
  slotEmpty: { backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderStyle: 'dashed' },
  slotName: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  slotEmptyText: { fontSize: 14, color: palette.slate[400] },

  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center' },
  pvRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  pvName: { flex: 1, fontSize: 15, color: colors.foreground, fontWeight: '500' },

  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropCenter: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', paddingHorizontal: 24 },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '70%' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.foreground, marginBottom: 12 },
  sheetEmpty: { fontSize: 15, color: colors.mutedForeground, paddingVertical: 12 },

  dialog: { backgroundColor: colors.card, borderRadius: 16, padding: 20, gap: 12 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground },
  dialogBody: { fontSize: 15, color: colors.mutedForeground, lineHeight: 21 },
  dialogRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  dialogBtn: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
