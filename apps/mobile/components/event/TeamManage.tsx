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
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { avatarUrl } from '@/lib/community-images';
import { colors, palette } from '../../theme';
import { Avatar, Button, Chip, useActionSheet, useBanner } from '../../components/ui';

type Participant = {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  status: string;
  is_standby: boolean;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
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
  const show = useActionSheet();
  const banner = useBanner();

  const [view, setView] = useState<'team' | 'player'>('team');
  const [busy, setBusy] = useState(false);

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
  const assignable = participants.filter((p) => !occupied.has(p.id));
  const confirmedCount = participants.filter((p) => p.status === 'confirmed' && !p.is_standby).length;

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

  const doAssign = (p: Participant, teamNumber: number, slot: Slot) => {
    void run(() =>
      assign.mutateAsync({ participantId: p.id, teamNumber, slot, targetName: pname(p) }),
    );
  };

  const onAssign = async (teamNumber: number, slot: Slot) => {
    if (assignable.length === 0) {
      banner.show(t('assignNoneEligible'));
      return;
    }
    const key = await show({
      title: t('assignTitle'),
      actions: assignable.map((p) => ({
        key: p.id,
        label: pname(p),
        leading: <Avatar name={pname(p)} uri={avatarUrl(p.profiles?.avatar_url)} colourKey={p.user_id ?? p.id} size="sm" decorative />,
        // An unconfirmed player (interested / invited, not yet RSVP'd) gets a
        // confirmation step before landing on the court — the host morphs the
        // same Modal from the candidate list straight into this prompt.
        confirm:
          p.status !== 'confirmed'
            ? { title: t('assignConfirmTitle'), body: t('assignConfirmBody', { name: pname(p) }), confirmLabel: t('continue') }
            : undefined,
      })),
    });
    const picked = assignable.find((p) => p.id === key);
    if (picked) doAssign(picked, teamNumber, slot);
  };

  const onSwitch = async (occupant: TeamSlotPlayer) => {
    const candidates = participants.filter((p) => p.id !== occupant.id);
    const otherId = await show({
      title: t('switchTitle'),
      actions: candidates.map((p) => ({
        key: p.id,
        label: pname(p),
        leading: <Avatar name={pname(p)} uri={avatarUrl(p.profiles?.avatar_url)} colourKey={p.user_id ?? p.id} size="sm" decorative />,
      })),
    });
    if (otherId) {
      void run(() => switchPlayers.mutateAsync({ participantA: occupant.id, participantB: otherId }));
    }
  };

  const onSlotPress = async (teamNumber: number, slot: Slot, occupant: TeamSlotPlayer | null) => {
    if (busy) return;
    if (!occupant) {
      await onAssign(teamNumber, slot);
      return;
    }
    const key = await show({
      title: pname(occupant),
      actions: [
        { key: 'switch', label: t('switchPlayerCta') },
        {
          key: 'remove',
          label: t('removeFromTeamCta'),
          destructive: true,
          confirm: { title: t('slotActionTitle'), body: pname(occupant), confirmLabel: t('removeFromTeamCta') },
        },
      ],
    });
    if (key === 'switch') {
      // Safe to open a second action sheet right after the first resolves —
      // `show()` only returns once the host has actually dismissed (see
      // sheetApi.ts), so there is never a second Modal racing the first.
      await onSwitch(occupant);
    } else if (key === 'remove') {
      void run(() => removeFromTeam.mutateAsync({ participantId: occupant.id, targetName: pname(occupant) }));
    }
  };

  if (isLoading) return <ActivityIndicator color={colors.foreground} style={{ marginTop: 24 }} />;

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
                      onPress={() => void onSlotPress(n, slot, occ)}
                      accessibilityRole="button"
                      disabled={busy}
                    >
                      {occ ? (
                        <View style={styles.slotFilledContent}>
                          {/* Decorative: the occupant's name is right beside it as its own Text node. */}
                          <Avatar
                            uri={avatarUrl(occ.profiles?.avatar_url)}
                            name={pname(occ)}
                            colourKey={occ.profiles?.id ?? occ.user_id}
                            size="sm"
                            decorative
                          />
                          <Text style={styles.slotName} numberOfLines={1}>
                            {pname(occ)}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.slotEmptyText}>{t('teamSlotEmpty')}</Text>
                      )}
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
  slotFilledContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.foreground },
  slotEmptyText: { fontSize: 14, color: palette.slate[400] },

  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center' },
  pvRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  pvName: { flex: 1, fontSize: 15, color: colors.foreground, fontWeight: '500' },
});
