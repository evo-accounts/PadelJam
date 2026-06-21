'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useMyGroups, useGroupSeasons, useStartNewSeason } from '@padel/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const KNOWN = new Set(['forbidden', 'not_a_member', 'group_not_found']);

export default function GroupManageSeasonsPage() {
  const { t } = useT('group');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useMyGroups();
  const seasons = useGroupSeasons(id);
  const startSeason = useStartNewSeason(id);
  const [error, setError] = useState<string | null>(null);

  const myRow = (mine.data ?? []).find((r) => r.group_id === id);
  const isManaging = !!myRow?.is_managing;
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isManaging) router.replace(`/app/group/${id}`);
  }, [mine.isLoading, mine.data, isManaging, id, router]);

  const current = (seasons.data ?? []).find((s) => s.ended_at == null);
  const previous = (seasons.data ?? []).filter((s) => s.ended_at != null);
  const currentNumber = current?.season_number ?? 0;

  const onStart = async () => {
    setError(null);
    try {
      await startSeason.mutateAsync();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(KNOWN.has(code) ? code : 'unknown_error'));
    }
  };

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isManaging) return null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('seasonsRow')}</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{t('currentSeasonLabel')}</p>
        <Card>
          <CardContent className="py-4">
            {current ? t('seasonTag', { number: current.season_number }) : '—'}
          </CardContent>
        </Card>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={startSeason.isPending}>{t('startSeasonCta')}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('startSeasonCta')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('startSeasonConfirm', { current: currentNumber, next: currentNumber + 1 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onStart}>{t('confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previous.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{t('previousSeasons')}</p>
          <Card className="divide-y p-0">
            {previous.map((s) => (
              <div key={s.id} className="px-4 py-3 text-sm">
                {t('seasonTag', { number: s.season_number })}
              </div>
            ))}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
