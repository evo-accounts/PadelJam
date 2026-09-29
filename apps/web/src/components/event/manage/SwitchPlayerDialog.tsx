'use client';
/**
 * Switch player (UX-MEVT-15), from the switch button on a filled team slot — web's twin of mobile's
 * `SwitchPlayerSheet` (#245), on the Manage dialog chrome.
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
import { useState } from 'react';
import { Search } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useSwitchPlayers, useSwitchWithInvitee } from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { avatarUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { ManageDialog } from './ManageDialog';
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

function SmallAvatar({ name, path }: { name: string; path: string | null }) {
  return (
    <Avatar className="size-9">
      <AvatarImage src={avatarUrl(path) ?? undefined} alt="" />
      <AvatarFallback className="text-xs">
        {name === '—' ? '?' : name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export function SwitchPlayerDialog({ eventId, player, team, candidates, onClose, onDone }: Props) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const switchPlayers = useSwitchPlayers(eventId);
  const switchWithInvitee = useSwitchWithInvitee(eventId);
  const [choice, setChoice] = useState<Candidate | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = switchPlayers.isPending || switchWithInvitee.isPending;
  const name = player.name ?? '—';
  const teamName = t('teamLabel', { number: team.number });

  const confirm = async () => {
    if (choice == null) {
      setError(t('tmSwitchPick'));
      return;
    }
    setError(null);
    const other = choice.name ?? '—';
    try {
      if (choice.participantId != null) {
        await switchPlayers.mutateAsync({
          participantA: player.participantId,
          participantB: choice.participantId,
        });
      } else if (choice.userId != null) {
        await switchWithInvitee.mutateAsync({
          participantId: player.participantId,
          userId: choice.userId,
        });
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
    <ManageDialog
      title={t('tmSwitchTitle')}
      description={t('tmSwitchBody', { name })}
      onClose={onClose}
      primaryLabel={tc('confirm')}
      onPrimary={() => void confirm()}
      busy={busy}
      error={error}
      testId="dialog-switch-player"
    >
      <div
        className="flex items-center gap-3 rounded-lg border bg-card p-3"
        data-testid="switch-player-selected"
      >
        <SmallAvatar name={name} path={player.avatarPath} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{teamName}</span>
        </span>
      </div>
      {candidates.length > 6 ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder={t('mpInviteSearch')}
            aria-label={t('mpInviteSearch')}
            autoComplete="off"
            className="pl-9"
            data-testid="switch-player-search"
          />
        </div>
      ) : null}
      {shown.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center"
          data-testid="switch-player-empty"
        >
          <p className="text-sm font-medium">{t('tmSwitchEmpty')}</p>
          <p className="text-sm text-muted-foreground">{t('tmSwitchEmptyBody')}</p>
        </div>
      ) : (
        <fieldset className="-mx-2 flex flex-col">
          <legend className="sr-only">{t('tmSwitchPick')}</legend>
          {shown.map((c) => {
            const on = choice?.key === c.key;
            const cname = c.name ?? '—';
            return (
              <label
                key={c.key}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                  on && 'bg-primary/5',
                )}
                data-testid={`switch-player-row-${c.key}`}
              >
                <SmallAvatar name={cname} path={c.avatarPath} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{cname}</span>
                  <span className="text-xs text-muted-foreground">{candidateSubtitle(t, c)}</span>
                </span>
                <input
                  type="radio"
                  name="switch-player-choice"
                  aria-label={cname}
                  className="size-4 accent-primary"
                  checked={on}
                  onChange={() => {
                    setError(null);
                    setChoice(c);
                  }}
                  data-testid={`switch-player-check-${c.key}`}
                />
              </label>
            );
          })}
        </fieldset>
      )}
    </ManageDialog>
  );
}
