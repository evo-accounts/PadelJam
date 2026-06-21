'use client';
import { useT } from '@padel/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/upload';

export interface EventParticipant {
  id: string;
  user_id: string | null;
  status: string;
  guest_name: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}
export interface EventTeamPlayer {
  guest_name: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}
export interface EventTeam {
  id: string;
  team_number: number;
  player_a: EventTeamPlayer | null;
  player_b: EventTeamPlayer | null;
}

function nameOf(p: { guest_name: string | null; profiles: { full_name: string | null } | null } | null): string {
  return p?.profiles?.full_name ?? p?.guest_name ?? '—';
}

function Row({ p }: { p: EventTeamPlayer }) {
  const name = nameOf(p);
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar className="size-9">
        <AvatarImage src={avatarUrl(p.profiles?.avatar_url) ?? undefined} />
        <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="truncate text-sm font-medium">{name}</span>
    </li>
  );
}

export function EventParticipantsList({
  participants,
  teams,
}: {
  participants: EventParticipant[];
  teams: EventTeam[];
}) {
  const { t } = useT('event');

  if (teams.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        {teams.map((team) => (
          <div key={team.id} className="flex flex-col gap-1">
            <p className="text-sm font-medium text-muted-foreground">
              {t('teamLabel', { number: team.team_number })}
            </p>
            <ul className="flex flex-col">
              {team.player_a ? <Row p={team.player_a} /> : null}
              {team.player_b ? <Row p={team.player_b} /> : null}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  if (participants.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('emptyPlayers')}</p>;
  }

  const confirmed = participants.filter((p) => p.status === 'confirmed');
  const waiting = participants.filter((p) => p.status === 'waiting_list');
  const invited = participants.filter((p) => p.status === 'invited');

  const groups: { key: string; label: string; rows: EventParticipant[] }[] = [
    { key: 'confirmed', label: t('confirmedGroup'), rows: confirmed },
    { key: 'waiting', label: t('waitlistGroup'), rows: waiting },
    { key: 'invited', label: t('invitedGroup'), rows: invited },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">{g.label}</p>
          <ul className="flex flex-col">
            {g.rows.map((p) => (
              <Row key={p.id} p={p} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
