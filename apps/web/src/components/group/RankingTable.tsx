'use client';
import Link from 'next/link';
import type { GroupRankingRow } from '@padel/api';
import { useT } from '@padel/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { avatarUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';

/** What the table can be sorted by. `points` is the ranking itself. */
export type RankingSort = 'points' | 'wins' | 'events';

/**
 * Two column sets of the same table (mirrors mobile's RankingList):
 *   preview  the group page's top 10 — Points / W / L (UX-GRP-04)
 *   full     the Ranking page and a season's final standings — Points / Events played (UX-GRP-06)
 */
export type RankingVariant = 'preview' | 'full';

/**
 * Re-orders rows for a sort other than points. Position (`rank`) always stays the ranking's own —
 * sorting by wins shows who won most, it does not re-rank the season.
 */
export function sortRanking(rows: GroupRankingRow[], sort: RankingSort): GroupRankingRow[] {
  if (sort === 'points') return rows;
  const key = sort === 'wins' ? (r: GroupRankingRow) => r.wins : (r: GroupRankingRow) => r.eventsPlayed;
  return [...rows].sort((a, b) => key(b) - key(a) || a.rank - b.rank);
}

/**
 * The group leaderboard. Someone who has left the group stays in it — their points were earned —
 * in greyscale with a "No longer in group" tag (decision 2 of the Groups audit plan). A row opens
 * the player's profile. Presentational: an empty `rows` is the caller's empty state.
 */
export function RankingTable({ rows, variant }: { rows: GroupRankingRow[]; variant: RankingVariant }) {
  const { t } = useT('group');
  const cols =
    variant === 'preview'
      ? [
          { key: 'points', header: t('rankingPointsHeader'), value: (r: GroupRankingRow) => r.points },
          { key: 'wins', header: t('rankingWinsHeader'), value: (r: GroupRankingRow) => r.wins },
          { key: 'losses', header: t('rankingLossesHeader'), value: (r: GroupRankingRow) => r.losses },
        ]
      : [
          { key: 'points', header: t('rankingPointsHeader'), value: (r: GroupRankingRow) => r.points },
          { key: 'events', header: t('rankingEventsHeader'), value: (r: GroupRankingRow) => r.eventsPlayed },
        ];

  return (
    <div className="flex flex-col rounded-lg border" role="table">
      <div role="row" className="flex items-center gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
        <span role="columnheader" className="w-6 shrink-0 text-center">
          {t('rankingRankHeader')}
        </span>
        <span role="columnheader" className="flex-1">
          {t('rankingPlayerHeader')}
        </span>
        {cols.map((c) => (
          <span role="columnheader" key={c.key} className="w-14 shrink-0 text-right">
            {c.header}
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const name = row.name ?? '—';
        return (
          <Link
            key={row.userId}
            role="row"
            href={`/app/profile/${row.userId}`}
            aria-label={t('rankingRowA11y', { rank: row.rank, name, points: row.points })}
            className={cn('flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50', !row.isMember && 'text-muted-foreground')}
          >
            <span role="cell" className="w-6 shrink-0 text-center font-medium tabular-nums">
              {row.rank}
            </span>
            <span role="cell" className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar className={cn('size-8', !row.isMember && 'grayscale')}>
                <AvatarImage src={avatarUrl(row.avatarUrl) ?? undefined} alt="" />
                <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate">{name}</span>
                {row.isMember ? null : (
                  <Badge variant="outline" className="mt-0.5">
                    {t('departedTag')}
                  </Badge>
                )}
              </span>
            </span>
            {cols.map((c) => (
              <span role="cell" key={c.key} className="w-14 shrink-0 text-right tabular-nums">
                {c.value(row)}
              </span>
            ))}
          </Link>
        );
      })}
    </div>
  );
}
