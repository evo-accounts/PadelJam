'use client';
import { useT } from '@padel/i18n';

export interface EventResultRow {
  rank: number;
  name: string | null;
  points: number;
}

export function EventResultTable({ rows }: { rows: EventResultRow[] }) {
  const { t } = useT('event');
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('emptyResult')}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="w-10 py-2 font-medium">{t('rank')}</th>
          <th className="py-2 font-medium">{t('playersTitle')}</th>
          <th className="w-20 py-2 text-right font-medium">{t('points')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.rank}-${i}`} className="border-t">
            <td className="py-2">{r.rank}</td>
            <td className="truncate py-2">{r.name ?? '—'}</td>
            <td className="py-2 text-right">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
