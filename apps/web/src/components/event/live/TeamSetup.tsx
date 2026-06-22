'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import {
  useEventTeams,
  useEventParticipants,
  useAssignToTeam,
  useRemoveFromTeam,
} from '@padel/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { avatarUrl } from '@/lib/upload';

interface TeamSetupProps {
  eventId: string;
  /** Part of the setup contract; team count/eligibility is server-driven so it is not used here. */
  numCourts?: number;
  canStart: boolean;
  starting: boolean;
  onStart: () => void;
}

type ParticipantRow = {
  id: string;
  user_id: string | null;
  status: string;
  is_standby: boolean;
  guest_name: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

function displayName(
  p: { guest_name: string | null; profiles: { full_name: string | null } | null } | null,
): string {
  return p?.profiles?.full_name ?? p?.guest_name ?? '—';
}

function initials(name: string): string {
  return name === '—' ? '?' : name.slice(0, 2).toUpperCase();
}

export function TeamSetup({ eventId, canStart, starting, onStart }: TeamSetupProps) {
  const { t } = useT('event');
  const teams = useEventTeams(eventId);
  const participants = useEventParticipants(eventId);
  const assignToTeam = useAssignToTeam(eventId);
  const removeFromTeam = useRemoveFromTeam(eventId);
  const [error, setError] = useState<string | null>(null);
  const [openSlot, setOpenSlot] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (x) {
      setError(t(x instanceof Error ? x.message : 'unknown_error'));
    }
  };

  if (teams.isLoading) return <Skeleton className="h-60" />;

  const teamRows = (teams.data ?? []).slice().sort((a, b) => a.team_number - b.team_number);
  const assigned = new Set<string>();
  for (const tm of teamRows) {
    if (tm.player_a?.id) assigned.add(tm.player_a.id);
    if (tm.player_b?.id) assigned.add(tm.player_b.id);
  }
  const eligible = ((participants.data ?? []) as ParticipantRow[]).filter(
    (p) => p.status === 'confirmed' && !assigned.has(p.id),
  );

  const renderFilledSlot = (
    player: { id: string; guest_name: string | null; profiles: { full_name: string | null; avatar_url: string | null } | null },
  ) => {
    const name = displayName(player);
    return (
      <div className="flex items-center gap-2">
        <Avatar size="sm">
          <AvatarImage src={avatarUrl(player.profiles?.avatar_url) ?? undefined} />
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => run(() => removeFromTeam.mutateAsync({ participantId: player.id, targetName: name }))}
        >
          {t('removeFromTeamCta')}
        </Button>
      </div>
    );
  };

  const renderEmptySlot = (teamNumber: number, slot: 'a' | 'b') => {
    const key = `${teamNumber}-${slot}`;
    return (
      <Dialog open={openSlot === key} onOpenChange={(o) => setOpenSlot(o ? key : null)}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground">
            {t('teamSlotEmpty')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('slotActionTitle')}</DialogTitle>
          </DialogHeader>
          {eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('assignNoneEligible')}</p>
          ) : (
            <ul className="flex flex-col">
              {eligible.map((p) => {
                const name = displayName(p);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-muted"
                      onClick={() =>
                        run(async () => {
                          await assignToTeam.mutateAsync({
                            participantId: p.id,
                            teamNumber,
                            slot,
                            targetName: name,
                          });
                          setOpenSlot(null);
                        })
                      }
                    >
                      <Avatar size="sm">
                        <AvatarImage src={avatarUrl(p.profiles?.avatar_url) ?? undefined} />
                        <AvatarFallback>{initials(name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('assignTitle')}</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {teamRows.map((tm) => (
          <Card key={tm.id}>
            <CardContent className="flex flex-col gap-2 py-4">
              <p className="text-sm font-medium">{t('teamLabel', { number: tm.team_number })}</p>
              {tm.player_a ? renderFilledSlot(tm.player_a) : renderEmptySlot(tm.team_number, 'a')}
              {tm.player_b ? renderFilledSlot(tm.player_b) : renderEmptySlot(tm.team_number, 'b')}
            </CardContent>
          </Card>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button className="self-start" disabled={!canStart || starting} onClick={onStart}>
        {t('startCta')}
      </Button>
    </div>
  );
}
