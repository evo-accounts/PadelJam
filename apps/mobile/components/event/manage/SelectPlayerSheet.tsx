/**
 * Select player (UX-MEVT-15), from the "+" on an empty team slot.
 *
 *   Title "Team 2", the occupancy "1/2" on the right and "Select players to set the team"; a
 *   search; "Add manually" (plan D7: a guest straight into this team, organizer_add_guest_to_team —
 *   team events are never mixed, so a name only); the players picked so far as compact avatars
 *   with a ✕; then everyone who can be placed (teamBoard.selectCandidates) with a selection
 *   control. At most as many picks as the team has open slots.
 *
 *   Picking someone who is not confirmed first shows "Confirm player", in place — the same Modal
 *   changes its content rather than stacking a second one. A player placed alone in a team is not
 *   confirmed yet (0071: only a complete pair holds spots), so the copy says "once the team has two
 *   players", which is what the server does.
 *
 *   Confirm places the picks in the open slots, a before b: a roster row through
 *   organizer_assign_to_team, a pending invitation without one through organizer_confirm_invitee.
 *   Refusals (slot_taken on a stale screen, event_full) are shown in the sheet (ManageSheet's rule).
 */
import { useAddGuestToTeam, useAssignToTeam, useConfirmInvitee } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { colors, space } from '../../../theme';
import { Avatar, Checkbox, EmptyState, Field, IconButton, ListRow, SearchInput, Text } from '../../ui';
import { ManageSheet } from './ManageSheet';
import { rosterErrorKey } from './manageRoster';
import { matchesName, needsConfirmStep, occupancyOf, openSlotsOf, type BoardTeam, type Candidate } from './teamBoard';
import { candidateSubtitle } from './teamCopy';

type Props = {
  eventId: string;
  team: BoardTeam;
  candidates: Candidate[];
  onClose: () => void;
  /** Everything placed: the caller closes the sheet and raises the success banner. */
  onDone: (message: string) => void;
};

type Mode = { kind: 'select' } | { kind: 'confirm'; candidate: Candidate } | { kind: 'manual' };

export function SelectPlayerSheet({ eventId, team, candidates, onClose, onDone }: Props) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const assign = useAssignToTeam(eventId);
  const confirmInvitee = useConfirmInvitee(eventId);
  const addGuest = useAddGuestToTeam(eventId);
  const [mode, setMode] = useState<Mode>({ kind: 'select' });
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Candidate[]>([]);
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const teamName = t('teamLabel', { n: team.number });
  const open = openSlotsOf(team);
  // The team can fill up underneath the sheet (a guest just added): keep only what still fits.
  const picks = picked.slice(0, open.length);
  const room = open.length - picks.length;
  const nameOf = (c: { name: string | null }) => c.name ?? '—';
  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    setError(t(rosterErrorKey(code), { defaultValue: t('unknown_error') }));
  };

  const add = (c: Candidate) => {
    setError(null);
    if (room === 0) {
      setError(t('tmSelectFull'));
      return;
    }
    setPicked([...picks, c]);
  };
  const toggle = (c: Candidate) => {
    if (picks.some((p) => p.key === c.key)) {
      setPicked(picks.filter((p) => p.key !== c.key));
      setError(null);
    } else if (needsConfirmStep(c) && room > 0) {
      setMode({ kind: 'confirm', candidate: c });
    } else {
      add(c);
    }
  };

  const place = async () => {
    if (picks.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const [i, c] of picks.entries()) {
        const slot = open[i]!;
        if (c.participantId != null) {
          await assign.mutateAsync({ participantId: c.participantId, teamNumber: team.number, slot });
        } else if (c.userId != null) {
          await confirmInvitee.mutateAsync({ userId: c.userId, teamNumber: team.number, slot });
        }
      }
      onDone(
        picks.length === 1
          ? t('tmAssignedToast', { name: nameOf(picks[0]!), team: teamName })
          : t('tmPairAssignedToast', { a: nameOf(picks[0]!), b: nameOf(picks[1]!), team: teamName }),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const saveGuest = async () => {
    const name = guestName.trim();
    if (name.length === 0) {
      setError(t('manualNameRequired'));
      return;
    }
    const slot = open[open.length - 1];
    if (slot == null) return;
    setBusy(true);
    setError(null);
    try {
      await addGuest.mutateAsync({ teamNumber: team.number, slot, name });
      setGuestName('');
      if (open.length === 1) {
        onDone(t('tmGuestAddedToast', { name, team: teamName }));
      } else {
        setMode({ kind: 'select' });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (mode.kind === 'confirm') {
    const c = mode.candidate;
    return (
      <ManageSheet
        title={t('tmConfirmPlayerTitle')}
        onClose={() => setMode({ kind: 'select' })}
        primaryLabel={tc('confirm')}
        onPrimary={() => {
          setMode({ kind: 'select' });
          add(c);
        }}
        testID="sheet-confirm-player"
      >
        <View style={styles.confirmHead}>
          <Avatar uri={avatarUrl(c.avatarPath)} name={nameOf(c)} colourKey={c.userId ?? c.key} size="lg" decorative />
          <Text variant="bodyStrong">{nameOf(c)}</Text>
        </View>
        <Text variant="body" tone="muted">
          {t('tmConfirmPlayerBody', { name: nameOf(c) })}
        </Text>
      </ManageSheet>
    );
  }

  if (mode.kind === 'manual') {
    return (
      <ManageSheet
        title={t('addManuallyCta')}
        onClose={() => {
          setError(null);
          setMode({ kind: 'select' });
        }}
        primaryLabel={t('sheetSave')}
        onPrimary={() => void saveGuest()}
        busy={busy}
        error={error}
        testID="sheet-team-guest"
      >
        <Field
          label={t('mpManualNameLabel')}
          value={guestName}
          onChangeText={(v) => {
            setGuestName(v);
            setError(null);
          }}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={60}
          returnKeyType="done"
          testID="team-guest-name"
        />
        <Text variant="body" tone="muted">
          {t('tmGuestNote', { team: teamName })}
        </Text>
        <Text variant="body" tone="muted">
          {t('mpManualNoteNoApp')}
        </Text>
      </ManageSheet>
    );
  }

  const shown = candidates.filter((c) => matchesName(c.name, query));
  return (
    <ManageSheet
      title={teamName}
      onClose={onClose}
      primaryLabel={tc('confirm')}
      onPrimary={() => void place()}
      busy={busy}
      error={error}
      testID="sheet-select-player"
    >
      <View style={styles.head}>
        <Text variant="body" tone="muted" style={styles.flex}>
          {t('tmSelectSubtitle')}
        </Text>
        <Text variant="bodyStrong" testID="select-player-occupancy">
          {t('tmOccupancy', { n: occupancyOf(team) + picks.length })}
        </Text>
      </View>
      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('mpInviteSearch')}
        accessibilityLabel={t('mpInviteSearch')}
        autoCorrect={false}
        testID="select-player-search"
      />
      {room > 0 ? (
        <Pressable
          style={styles.addManual}
          accessibilityRole="button"
          onPress={() => {
            setError(null);
            setMode({ kind: 'manual' });
          }}
          testID="select-player-add-manually"
        >
          <Text variant="label" tone="primary">
            {t('addManuallyShort')}
          </Text>
        </Pressable>
      ) : null}
      {picks.length > 0 ? (
        <View style={styles.picks}>
          {picks.map((c) => (
            <View key={c.key} style={styles.pick}>
              <Avatar uri={avatarUrl(c.avatarPath)} name={nameOf(c)} colourKey={c.userId ?? c.key} size="md" decorative />
              <IconButton
                icon={<SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' } as never} size={18} tintColor={colors.mutedForeground} />}
                size="sm"
                accessibilityLabel={t('tmUnpickA11y', { name: nameOf(c) })}
                onPress={() => toggle(c)}
                style={styles.pickX}
                testID={`select-player-unpick-${c.key}`}
              />
            </View>
          ))}
        </View>
      ) : null}
      {shown.length === 0 ? (
        <EmptyState
          title={query.trim() ? t('mpInviteNoResults') : t('tmSelectEmpty')}
          body={t('tmSelectEmptyBody')}
          testID="select-player-empty"
        />
      ) : (
        <View>
          {shown.map((c) => {
            const on = picks.some((p) => p.key === c.key);
            return (
              <ListRow
                key={c.key}
                title={nameOf(c)}
                subtitle={candidateSubtitle(t, c)}
                onPress={() => toggle(c)}
                selected={on}
                leading={<Avatar uri={avatarUrl(c.avatarPath)} name={nameOf(c)} colourKey={c.userId ?? c.key} size="md" decorative />}
                trailing={<Checkbox checked={on} onChange={() => toggle(c)} accessibilityLabel={nameOf(c)} />}
                testID={`select-player-row-${c.key}`}
              />
            );
          })}
        </View>
      )}
    </ManageSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  addManual: { paddingVertical: space[1] },
  picks: { flexDirection: 'row', gap: space[3] },
  pick: { paddingTop: space[1], paddingRight: space[1] },
  pickX: { position: 'absolute', top: -space[1], right: -space[2] },
  confirmHead: { alignItems: 'center', gap: space[2] },
});
