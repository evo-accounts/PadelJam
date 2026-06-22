'use client';
import { useT } from '@padel/i18n';
import { useEventStandings, useEventParticipants, useEventTeams } from '@padel/api';
import { standingsName } from '@padel/utils';
import { Skeleton } from '@/components/ui/skeleton';

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

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="w-10 py-2 font-medium">{t('rankCol')}</th>
          <th className="py-2 font-medium">{t('playerCol')}</th>
          <th className="w-16 py-2 text-right font-medium">{t('pointsCol')}</th>
          <th className="w-24 py-2 text-right font-medium">{t('recordCol')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.entity_id} className="border-t">
            <td className="py-2">{row.rank}</td>
            <td className="truncate py-2">
              {standingsName(row, participantNameById, teamNumberById, (n) =>
                t('teamLabel', { number: n }),
              )}
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
