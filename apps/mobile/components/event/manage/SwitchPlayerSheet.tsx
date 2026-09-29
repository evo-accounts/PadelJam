/**
 * Switch player (UX-MEVT-15), from the switch icon on a filled team slot.
 *
 *   The selected player on top; below, who can take their place (teamBoard.switchCandidates):
 *   players of other teams, then invited and waiting-list players. One choice, then Confirm.
 *
 *   - another team's player → the two swap slots (organizer_switch_players);
 *   - an invited or waiting player with a roster row → they take the slot, and the selected
 *     player goes back to Invited (organizer_switch_players does both);
 *   - a pending invitee without a row → organizer_switch_with_invitee (0127) creates the row,
 *     accepts the invitation and swaps, in one transaction.
 *   Whoever enters a complete team is confirmed (0071's pair rule).
 */
import { useSwitchPlayers, useSwitchWithInvitee } from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { space } from '../../../theme';
import { Avatar, Checkbox, EmptyState, ListRow, SearchInput, Text } from '../../ui';
import { ManageSheet } from './ManageSheet';
import { rosterErrorKey } from './manageRoster';
import { matchesName, type BoardPlayer, type BoardTeam, type Candidate } from './teamBoard';
import { candidateSubtitle } from './teamCopy';

type Props = {
  eventId: string;
  player: BoardPlayer;
  team: BoardTeam;
  candidates: Candidate[];
  onClose: () => void;
  onDone: (message: string) => void;
};

export function SwitchPlayerSheet({ eventId, player, team, candidates, onClose, onDone }: Props) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const switchPlayers = useSwitchPlayers(eventId);
  const switchWithInvitee = useSwitchWithInvitee(eventId);
  const [choice, setChoice] = useState<Candidate | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = switchPlayers.isPending || switchWithInvitee.isPending;
  const name = player.name ?? '—';
  const teamName = t('teamLabel', { n: team.number });

  const confirm = async () => {
    if (choice == null) {
      setError(t('tmSwitchPick'));
      return;
    }
    setError(null);
    const other = choice.name ?? '—';
    try {
      if (choice.participantId != null) {
        await switchPlayers.mutateAsync({ participantA: player.participantId, participantB: choice.participantId });
      } else if (choice.userId != null) {
        await switchWithInvitee.mutateAsync({ participantId: player.participantId, userId: choice.userId });
      } else {
        return;
      }
      onDone(
        choice.kind === 'team'
          ? t('tmSwitchedToast', { a: name, b: other })
          : t('tmReplacedToast', { a: name, b: other, team: teamName }),
      );
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(rosterErrorKey(code), { defaultValue: t('unknown_error') }));
    }
  };

  const shown = candidates.filter((c) => matchesName(c.name, query));
  return (
    <ManageSheet
      title={t('tmSwitchTitle')}
      onClose={onClose}
      primaryLabel={tc('confirm')}
      onPrimary={() => void confirm()}
      busy={busy}
      error={error}
      testID="sheet-switch-player"
    >
      <ListRow
        variant="card"
        title={name}
        subtitle={teamName}
        leading={<Avatar uri={avatarUrl(player.avatarPath)} name={name} colourKey={player.userId ?? player.participantId} size="md" decorative />}
        testID="switch-player-selected"
      />
      <Text variant="body" tone="muted">
        {t('tmSwitchBody', { name })}
      </Text>
      {candidates.length > 6 ? (
        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('mpInviteSearch')}
          accessibilityLabel={t('mpInviteSearch')}
          autoCorrect={false}
          testID="switch-player-search"
        />
      ) : null}
      {shown.length === 0 ? (
        <EmptyState title={t('tmSwitchEmpty')} body={t('tmSwitchEmptyBody')} testID="switch-player-empty" />
      ) : (
        <View style={styles.list}>
          {shown.map((c) => {
            const on = choice?.key === c.key;
            const cname = c.name ?? '—';
            const pick = () => {
              setError(null);
              setChoice(on ? null : c);
            };
            return (
              <ListRow
                key={c.key}
                title={cname}
                subtitle={candidateSubtitle(t, c)}
                onPress={pick}
                selected={on}
                leading={<Avatar uri={avatarUrl(c.avatarPath)} name={cname} colourKey={c.userId ?? c.key} size="md" decorative />}
                trailing={<Checkbox checked={on} onChange={pick} accessibilityLabel={cname} />}
                testID={`switch-player-row-${c.key}`}
              />
            );
          })}
        </View>
      )}
    </ManageSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[1] },
});
