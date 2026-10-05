'use client';
import { useT } from '@padel/i18n';
import { useEventStandings, useEventParticipants, useEventTeams } from '@padel/api';
import { standingsName } from '@padel/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The event standings. A team event ranks pairs (UX-MEVT-27, decision 11, 0125): each row names
 * both players together — "A & B" — with the team's result, since the pair plays the whole event
 * as one. Every other modality ranks players.
 */
export function Leaderboard({ eventId }: { eventId: string }) {
  const { t } = useT('event');
  const standings = useEventStandings(eventId);
  const participants = useEventParticipants(eventId);
  const teams = useEventTeams(eventId);

  if (standings.isLoading || participants.isLoading || teams.isLoading) {
    return <Skeleton className="h-40" />;
  }

  const rows = [...(standings.data ?? [])].sort((a, b) => a.rank - b.rank);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('standingsEmpty')}</p>;
  }

  const participantNameById = Object.fromEntries(
    (participants.data ?? []).map((p) => [p.id, p.profiles?.full_name ?? p.guest_name ?? '—']),
  );
  const teamNumberById = Object.fromEntries(
    (teams.data ?? []).map((tm) => [tm.id, tm.team_number]),
  );
  const teamLabel = (n: number) => t('teamLabel', { number: n });
  const rowName = (row: (typeof rows)[number]): string => {
    if (!row.is_team) return standingsName(row, participantNameById, teamNumberById, teamLabel);
    const a = row.name_a ?? (row.participant_a_id ? participantNameById[row.participant_a_id] : undefined);
    const b = row.name_b ?? (row.participant_b_id ? participantNameById[row.participant_b_id] : undefined);
    const pair = [a, b].filter(Boolean).join(' & ');
    return pair || teamLabel(teamNumberById[row.entity_id] ?? row.team_number ?? 0);
  };
  const teamRows = rows.some((r) => r.is_team);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="w-10 py-2 font-medium">{t('rankCol')}</th>
          <th className="py-2 font-medium">{t(teamRows ? 'teamCol' : 'playerCol')}</th>
          <th className="w-16 py-2 text-right font-medium">{t('pointsCol')}</th>
          <th className="w-24 py-2 text-right font-medium">{t('recordCol')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.entity_id} className="border-t">
            <td className="py-2">{row.rank}</td>
            <td className={row.is_team ? 'py-2 break-words' : 'truncate py-2'} data-testid="standings-name">
              {rowName(row)}
            </td>
            <td className="py-2 text-right">{row.points}</td>
            <td className="py-2 text-right">
              {t('wDL', { w: row.wins, d: row.draws, l: row.losses })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
