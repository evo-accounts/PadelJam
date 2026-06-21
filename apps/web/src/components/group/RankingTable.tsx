'use client';
import { useT } from '@padel/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface RankingRow {
  name: string | null;
  avatarUrl: string | null;
  points: number;
  events: number;
}

interface RankingTableProps {
  rows: RankingRow[];
}

export function RankingTable({ rows }: RankingTableProps) {
  const { t } = useT('group');

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t('emptyRanking')}</p>;
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b px-1 py-2 text-xs font-medium text-muted-foreground">
        <span className="w-6 shrink-0 text-center">{t('rank')}</span>
        <span className="flex-1">{t('members')}</span>
        <span className="w-16 shrink-0 text-right">{t('points')}</span>
        <span className="w-16 shrink-0 text-right">{t('eventsPlayed')}</span>
      </div>
      {rows.map((row, i) => {
        const name = row.name ?? '—';
        const initials = (row.name ?? '?').slice(0, 2).toUpperCase();
        return (
          <div key={i} className="flex items-center gap-3 px-1 py-2">
            <span className="w-6 shrink-0 text-center font-medium tabular-nums">{i + 1}</span>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar className="size-8">
                <AvatarImage src={row.avatarUrl ?? undefined} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="truncate">{name}</span>
            </div>
            <span className="w-16 shrink-0 text-right tabular-nums">{row.points}</span>
            <span className="w-16 shrink-0 text-right tabular-nums">{row.events}</span>
          </div>
        );
      })}
    </div>
  );
}
