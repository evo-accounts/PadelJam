'use client';
/**
 * The full ranking of the current season (UX-GRP-06), from "See all" on the group page: position,
 * avatar, name, Points and Events played, sortable, with the period filter that only appears here,
 * where there is content to filter (UX-GRP-04). A row opens the player; someone who has left stays
 * ranked, in greyscale. "Share" copies the standings as text (the native share sheet where the
 * browser has one).
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useGroup, useGroupRanking, useGroupSeasons } from '@padel/api';
import { useT } from '@padel/i18n';
import { GroupEmpty } from '@/components/group/GroupEmpty';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { RankingTable, sortRanking, type RankingSort } from '@/components/group/RankingTable';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { groupUrl, shareText } from '@/lib/groupShare';
import { cn } from '@/lib/utils';

type Period = 'all' | '3m' | '6m' | '12m';
const PERIODS: { value: Period; key: 'periodAll' | 'period3m' | 'period6m' | 'period12m'; months: number }[] = [
  { value: 'all', key: 'periodAll', months: 0 },
  { value: '3m', key: 'period3m', months: 3 },
  { value: '6m', key: 'period6m', months: 6 },
  { value: '12m', key: 'period12m', months: 12 },
];

export default function GroupRankingPage() {
  const { t, i18n } = useT('group');
  const { id } = useParams<{ id: string }>();
  const { data: group } = useGroup(id);
  const { data: seasons } = useGroupSeasons(id);
  const season = (seasons ?? []).find((s) => s.ended_at == null);
  const [period, setPeriod] = useState<Period>('all');
  const [sort, setSort] = useState<RankingSort>('points');
  // The period's start, computed when the filter changes rather than during render (purity).
  const [since, setSince] = useState<string | undefined>(undefined);
  const ranking = useGroupRanking(season?.id ?? '', since);
  const rows = sortRanking(ranking.data ?? [], sort);
  const lastUpdated = rows[0]?.lastUpdated;

  const pickPeriod = (p: Period) => {
    setPeriod(p);
    const months = PERIODS.find((x) => x.value === p)?.months ?? 0;
    if (months === 0) return setSince(undefined);
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    setSince(d.toISOString());
  };

  const onShare = async () => {
    const lines = (ranking.data ?? []).slice(0, 10).map((r) => `${r.rank}. ${r.name ?? '—'} — ${r.points}`);
    const title = `${group?.name ?? ''} · ${t('rankingTitle')}`;
    try {
      const how = await shareText(title, [title, ...lines].join('\n'), groupUrl(id));
      if (how === 'copied') toast(t('rankingCopied'));
    } catch {
      toast(t('copyFailed'), 'error');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <GroupPageTitle
        title={t('rankingTitle')}
        fallbackHref={`/app/group/${id}`}
        subtitle={
          lastUpdated
            ? t('lastUpdate', {
                date: new Date(lastUpdated).toLocaleDateString(i18n.language, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }),
              })
            : group?.name
        }
        actions={
          rows.length > 0 ? (
            <Button variant="secondary" onClick={() => void onShare()} data-testid="ranking-share">
              {t('shareCta')}
            </Button>
          ) : null
        }
      />
      {rows.length > 0 || period !== 'all' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('periodLabel')}>
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                size="sm"
                variant={period === p.value ? 'primary' : 'secondary'}
                aria-pressed={period === p.value}
                className={cn('rounded-full')}
                onClick={() => pickPeriod(p.value)}
              >
                {t(p.key)}
              </Button>
            ))}
          </div>
          <Tabs value={sort === 'wins' ? 'points' : sort} onValueChange={(v) => setSort(v as RankingSort)}>
            <TabsList>
              <TabsTrigger value="points">{t('sortPoints')}</TabsTrigger>
              <TabsTrigger value="events">{t('sortEvents')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : null}
      {ranking.isLoading && !!season ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <GroupEmpty title={t('rankingEmptyTitle')} body={t('rankingPlaceholder')} testId="empty-ranking" />
      ) : (
        <RankingTable rows={rows} variant="full" />
      )}
    </div>
  );
}
