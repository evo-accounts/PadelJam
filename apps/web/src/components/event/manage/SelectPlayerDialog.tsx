'use client';
/**
 * Select player (UX-MEVT-15), from the "+" on an empty team slot — web's twin of mobile's
 * `SelectPlayerSheet` (#245), on the Manage dialog chrome.
 *
 *   Title "Team 2", the occupancy "1/2" on the right and "Select players to set the team"; a
 *   search; "Add manually" (plan D7: a guest straight into this team, organizer_add_guest_to_team —
 *   team events are never mixed, so a name only); the players picked so far as compact avatars
 *   with a ✕; then everyone who can be placed (teamBoard.selectCandidates) with a checkbox. At most
 *   as many picks as the team has open slots.
 *
 *   Picking someone who is not confirmed first shows "Confirm player" in place — the same dialog
 *   changes its content rather than stacking a second one. A player placed alone in a team is not
 *   confirmed yet (0071: only a complete pair holds spots), so the copy says "once the team has two
 *   players", which is what the server does.
 *
 *   Confirm places the picks in the open slots, a before b: a roster row through
 *   organizer_assign_to_team, a pending invitation without one through organizer_confirm_invitee.
 *   Refusals (slot_taken on a stale page, event_full) are shown in the dialog's footer.
 */
import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useAddGuestToTeam, useAssignToTeam, useConfirmInvitee } from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { avatarUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { ManageDialog } from './ManageDialog';
import { rosterErrorKey } from './manageRoster';
import {
  matchesName,
  needsConfirmStep,
  occupancyOf,
  openSlotsOf,
  type BoardTeam,
  type Candidate,
} from './teamBoard';
import { candidateSubtitle } from './teamCopy';

type Props = {
  eventId: string;
  team: BoardTeam;
  candidates: Candidate[];
  onClose: () => void;
  /** Everything placed: the caller closes the dialog and raises the toast. */
  onDone: (message: string) => void;
};

type Mode = { kind: 'select' } | { kind: 'confirm'; candidate: Candidate } | { kind: 'manual' };

const nameOf = (c: { name: string | null }) => c.name ?? '—';

function CandidateAvatar({ c, className }: { c: Candidate; className?: string }) {
  const name = nameOf(c);
  return (
    <Avatar className={cn('size-9', className)}>
      <AvatarImage src={avatarUrl(c.avatarPath) ?? undefined} alt="" />
      <AvatarFallback className="text-xs">
        {name === '—' ? '?' : name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export function SelectPlayerDialog({ eventId, team, candidates, onClose, onDone }: Props) {
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

  const teamName = t('teamLabel', { number: team.number });
  const open = openSlotsOf(team);
  // The team can fill up underneath the dialog (a guest just added): keep only what still fits.
  const picks = picked.slice(0, open.length);
  const room = open.length - picks.length;
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
    if (picks.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const [i, c] of picks.entries()) {
        const slot = open[i]!;
        if (c.participantId != null) {
          await assign.mutateAsync({
            participantId: c.participantId,
            teamNumber: team.number,
            slot,
            targetName: c.name ?? undefined,
          });
        } else if (c.userId != null) {
          await confirmInvitee.mutateAsync({ userId: c.userId, teamNumber: team.number, slot });
        }
      }
      onDone(
        picks.length === 1
          ? t('tmAssignedToast', { name: nameOf(picks[0]!), team: teamName })
          : t('tmPairAssignedToast', {
              a: nameOf(picks[0]!),
              b: nameOf(picks[1]!),
              team: teamName,
            }),
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
      <ManageDialog
        title={t('tmConfirmPlayerTitle')}
        onClose={() => setMode({ kind: 'select' })}
        primaryLabel={tc('confirm')}
        onPrimary={() => {
          setMode({ kind: 'select' });
          add(c);
        }}
        testId="dialog-confirm-player"
      >
        <div className="flex flex-col items-center gap-2">
          <CandidateAvatar c={c} className="size-14" />
          <span className="font-medium">{nameOf(c)}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('tmConfirmPlayerBody', { name: nameOf(c) })}
        </p>
      </ManageDialog>
    );
  }

  if (mode.kind === 'manual') {
    return (
      <ManageDialog
        title={t('addManuallyCta')}
        onClose={() => {
          setError(null);
          setMode({ kind: 'select' });
        }}
        primaryLabel={t('sheetSave')}
        onPrimary={() => void saveGuest()}
        busy={busy}
        error={error}
        testId="dialog-team-guest"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="team-guest-name">{t('mpManualNameLabel')}</Label>
          <Input
            id="team-guest-name"
            value={guestName}
            onChange={(ev) => {
              setGuestName(ev.target.value);
              setError(null);
            }}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') void saveGuest();
            }}
            maxLength={60}
            autoComplete="off"
            autoFocus
            data-testid="team-guest-name"
          />
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{t('tmGuestNote', { team: teamName })}</p>
          <p>{t('mpManualNoteNoApp')}</p>
        </div>
      </ManageDialog>
    );
  }

  const shown = candidates.filter((c) => matchesName(c.name, query));
  return (
    <ManageDialog
      title={teamName}
      description={t('tmSelectSubtitle')}
      onClose={onClose}
      primaryLabel={tc('confirm')}
      onPrimary={() => void place()}
      busy={busy}
      error={error}
      testId="dialog-select-player"
    >
      <p
        className="-mt-2 self-end text-sm font-medium"
        aria-live="polite"
        data-testid="select-player-occupancy"
      >
        {t('tmOccupancy', { n: occupancyOf(team) + picks.length })}
      </p>
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
          data-testid="select-player-search"
        />
      </div>
      {room > 0 ? (
        <Button
          variant="tertiary"
          className="self-start"
          onClick={() => {
            setError(null);
            setMode({ kind: 'manual' });
          }}
          data-testid="select-player-add-manually"
        >
          {t('addManuallyShort')}
        </Button>
      ) : null}
      {picks.length > 0 ? (
        <ul className="flex gap-3" data-testid="select-player-picks">
          {picks.map((c) => (
            <li key={c.key} className="relative pt-1 pr-1">
              <CandidateAvatar c={c} className="size-11" />
              <Button
                variant="secondary"
                size="icon-xs"
                className="absolute -top-1 -right-2 rounded-full"
                aria-label={t('tmUnpickA11y', { name: nameOf(c) })}
                onClick={() => toggle(c)}
                data-testid={`select-player-unpick-${c.key}`}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {shown.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center"
          data-testid="select-player-empty"
        >
          <p className="text-sm font-medium">
            {query.trim() ? t('mpInviteNoResults') : t('tmSelectEmpty')}
          </p>
          <p className="text-sm text-muted-foreground">{t('tmSelectEmptyBody')}</p>
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {shown.map((c) => {
            const on = picks.some((p) => p.key === c.key);
            return (
              <li key={c.key}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50',
                    on && 'bg-primary/5',
                  )}
                  data-testid={`select-player-row-${c.key}`}
                >
                  <CandidateAvatar c={c} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{nameOf(c)}</span>
                    <span className="text-xs text-muted-foreground">{candidateSubtitle(t, c)}</span>
                  </span>
                  <input
                    type="checkbox"
                    aria-label={nameOf(c)}
                    className="size-4 accent-primary"
                    checked={on}
                    onChange={() => toggle(c)}
                    data-testid={`select-player-check-${c.key}`}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </ManageDialog>
  );
}
