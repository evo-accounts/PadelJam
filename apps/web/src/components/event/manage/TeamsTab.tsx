'use client';
/**
 * The Teams tab of a team event's Manage players (UX-MEVT-14, 26) — web's twin of mobile's
 * `TeamsTab` (#245).
 *
 *   - an instruction line, then what is still open (UX-MEVT-26): open slots, and how many of them
 *     sit in half-formed teams;
 *   - one block per team, two slots side by side. A filled slot is a card with the photo, the
 *     name, a switch button and a ✕ in its top-right corner; an empty one a dashed outline with a
 *     "+" that opens the Select player dialog (UX-MEVT-15);
 *   - at the bottom, the players without a team — confirmed first, then interested — as a row of
 *     cards. A card is dragged (HTML5 drag and drop) onto an empty slot; its "Assign to team…"
 *     menu does the same from the keyboard or a touch screen, so nothing is drag-only.
 *
 * Presentational: every change goes through the callbacks, which the page turns into RPCs.
 */
import { useState } from 'react';
import { ArrowLeftRight, Plus, UserRoundPlus, X } from 'lucide-react';
import { useT } from '@padel/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { avatarUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';
import {
  openSlotsOf,
  teamsWithOpenSlot,
  type BoardPlayer,
  type BoardTeam,
  type Slot,
  type TeamBoard,
} from './teamBoard';

type Props = {
  board: TeamBoard;
  /** A scheduled event; afterwards the board is read-only. */
  editable: boolean;
  onAdd: (team: BoardTeam, slot: Slot) => void;
  onSwitch: (player: BoardPlayer, team: BoardTeam) => void;
  onRemove: (player: BoardPlayer, team: BoardTeam) => void;
  /** An unassigned card dropped on (or assigned from its menu to) an empty slot. */
  onPlace: (player: BoardPlayer, team: BoardTeam, slot: Slot) => void;
};

/** The drag payload's type: only our own cards are accepted by a slot. */
const DRAG_TYPE = 'application/x-padeljam-participant';

const nameOf = (p: BoardPlayer) => p.name ?? '—';
const initials = (name: string) => (name === '—' ? '?' : name.slice(0, 2).toUpperCase());

function PlayerAvatar({ player, className }: { player: BoardPlayer; className?: string }) {
  const name = nameOf(player);
  return (
    <Avatar className={cn('size-10', className)}>
      <AvatarImage src={avatarUrl(player.avatarPath) ?? undefined} alt="" />
      <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function TeamsTab({ board, editable, onAdd, onSwitch, onRemove, onPlace }: Props) {
  const { t } = useT('event');
  const [dragging, setDragging] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const teamName = (n: number) => t('teamLabel', { number: n });

  const summary =
    board.openSlots === 0
      ? t('tmAllComplete')
      : [
          t('tmOpenSlots', { count: board.openSlots }),
          board.openInHalfTeams > 0 ? t('tmHalfTeams', { count: board.openInHalfTeams }) : null,
        ]
          .filter(Boolean)
          .join(' · ');

  const byId = new Map(board.unassigned.map((p) => [p.participantId, p]));
  const open = teamsWithOpenSlot(board);

  const renderSlot = (team: BoardTeam, slot: Slot) => {
    const player = slot === 'a' ? team.a : team.b;
    const id = `team-slot-${team.number}-${slot}`;
    if (player) {
      const name = nameOf(player);
      return (
        <div
          key={slot}
          className="relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border bg-card px-2 pt-5 pb-3 text-center"
          data-testid={id}
        >
          {editable ? (
            <div className="absolute top-1 right-1 flex">
              <Button
                variant="tertiary"
                size="icon-sm"
                aria-label={t('tmSwitchA11y', { name })}
                onClick={() => onSwitch(player, team)}
                data-testid={`${id}-switch`}
              >
                <ArrowLeftRight />
              </Button>
              <Button
                variant="tertiary"
                size="icon-sm"
                aria-label={t('tmRemoveA11y', { name })}
                onClick={() => onRemove(player, team)}
                data-testid={`${id}-remove`}
              >
                <X />
              </Button>
            </div>
          ) : null}
          <PlayerAvatar player={player} />
          <span className="w-full truncate text-sm font-medium">{name}</span>
          {player.guest ? <Badge variant="secondary">{t('guestTag')}</Badge> : null}
        </div>
      );
    }
    const key = `${team.number}-${slot}`;
    const droppable = editable && dragging != null;
    return (
      <div
        key={slot}
        className={cn(
          'flex min-h-28 items-center justify-center rounded-lg border-2 border-dashed transition-colors',
          hover === key ? 'border-primary bg-primary/5' : 'border-border',
        )}
        onDragOver={(ev) => {
          if (!droppable || !ev.dataTransfer.types.includes(DRAG_TYPE)) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
          if (hover !== key) setHover(key);
        }}
        onDragLeave={() => setHover((h) => (h === key ? null : h))}
        onDrop={(ev) => {
          ev.preventDefault();
          setHover(null);
          setDragging(null);
          const p = byId.get(ev.dataTransfer.getData(DRAG_TYPE));
          if (p) onPlace(p, team, slot);
        }}
        data-testid={id}
      >
        {editable ? (
          <Button
            variant="tertiary"
            size="icon"
            className="rounded-full"
            aria-label={t('tmAddToTeamA11y', { team: teamName(team.number) })}
            onClick={() => onAdd(team, slot)}
            data-testid={`${id}-add`}
          >
            <Plus />
          </Button>
        ) : null}
      </div>
    );
  };

  const teamOption = (tm: BoardTeam) => {
    const mate = tm.a ?? tm.b;
    return mate
      ? t('tmTeamOptionWith', { team: teamName(tm.number), name: nameOf(mate) })
      : t('tmTeamOptionEmpty', { team: teamName(tm.number) });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="teams-tab">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{t('tmInstruction')}</p>
        <p className="text-sm font-medium" aria-live="polite" data-testid="teams-summary">
          {summary}
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2" data-testid="teams-list">
        {board.teams.map((tm) => (
          <li
            key={tm.number}
            className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3"
            data-testid={`team-${tm.number}`}
          >
            <span className="flex items-center justify-between text-sm font-medium">
              <span>{teamName(tm.number)}</span>
              <span className="text-muted-foreground">
                {t('tmOccupancy', { n: (tm.a ? 1 : 0) + (tm.b ? 1 : 0) })}
              </span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              {renderSlot(tm, 'a')}
              {renderSlot(tm, 'b')}
            </div>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-2" aria-labelledby="teams-unassigned-title">
        <h2 id="teams-unassigned-title" className="text-sm font-medium">
          {t('tmUnassignedTitle', { n: board.unassigned.length })}
        </h2>
        {board.unassigned.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="teams-unassigned-empty">
            {t('tmUnassignedEmpty')}
          </p>
        ) : (
          <ul className="flex gap-2 overflow-x-auto pb-2" data-testid="teams-unassigned">
            {board.unassigned.map((p) => {
              const name = nameOf(p);
              return (
                <li
                  key={p.participantId}
                  draggable={editable}
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData(DRAG_TYPE, p.participantId);
                    ev.dataTransfer.effectAllowed = 'move';
                    setDragging(p.participantId);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setHover(null);
                  }}
                  className={cn(
                    'flex w-32 shrink-0 flex-col items-center gap-1.5 rounded-lg border bg-card p-3 text-center',
                    editable && 'cursor-grab active:cursor-grabbing',
                    dragging === p.participantId && 'opacity-50',
                  )}
                  data-testid={`teams-unassigned-${p.participantId}`}
                >
                  <PlayerAvatar player={p} />
                  <span className="w-full truncate text-sm font-medium">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.status === 'confirmed' ? t('tmKindConfirmed') : t('tmKindInterested')}
                    {p.guest ? ` · ${t('guestTag')}` : ''}
                  </span>
                  {editable ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-1 w-full"
                          aria-label={t('tmAssignMenuA11y', { name })}
                          data-testid={`teams-assign-${p.participantId}`}
                        >
                          <UserRoundPlus aria-hidden />
                          <span className="truncate">{t('tmAssignMenu')}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>{t('tmPickTeamLabel')}</DropdownMenuLabel>
                        {open.length === 0 ? (
                          <DropdownMenuItem disabled>{t('tmNoOpenTeam')}</DropdownMenuItem>
                        ) : (
                          open.map((tm) => (
                            <DropdownMenuItem
                              key={tm.number}
                              onSelect={() => onPlace(p, tm, openSlotsOf(tm)[0]!)}
                              data-testid={`teams-assign-${p.participantId}-team-${tm.number}`}
                            >
                              {teamOption(tm)}
                            </DropdownMenuItem>
                          ))
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
