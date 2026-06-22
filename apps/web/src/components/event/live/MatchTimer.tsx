'use client';
import { useEffect, useState } from 'react';
import { useT } from '@padel/i18n';
import { useEventTimer, useSetEventTimer } from '@padel/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function format(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function MatchTimer({
  eventId,
  isOrganizer,
}: {
  eventId: string;
  isOrganizer: boolean;
}) {
  const { t } = useT('event');
  const timer = useEventTimer(eventId);
  const setTimer = useSetEventTimer(eventId);
  const [now, setNow] = useState(() => Date.now());

  const status = timer.data?.status;

  useEffect(() => {
    if (status !== 'running') return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (timer.isLoading) return <Skeleton className="h-40" />;

  const row = timer.data;
  let remaining = row?.duration_seconds ?? 0;
  if (row) {
    if (row.status === 'running' && row.started_at) {
      const elapsed = (now - Date.parse(row.started_at)) / 1000;
      remaining = Math.max(0, row.duration_seconds - elapsed);
    } else if (row.status === 'paused' && row.paused_at && row.started_at) {
      const elapsed = (Date.parse(row.paused_at) - Date.parse(row.started_at)) / 1000;
      remaining = Math.max(0, row.duration_seconds - elapsed);
    } else {
      remaining = row.duration_seconds;
    }
  }

  const act = (action: 'start' | 'pause' | 'resume' | 'reset') => {
    setTimer.mutateAsync(action).catch(() => {
      /* surfaced via realtime refetch; ignore here */
    });
  };

  const currentStatus = row?.status ?? 'idle';

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-8">
        <span className="text-6xl font-bold tabular-nums">{format(remaining)}</span>
        {isOrganizer ? (
          <div className="flex gap-2">
            {currentStatus === 'idle' ? (
              <Button disabled={setTimer.isPending} onClick={() => act('start')}>
                {t('timerStart')}
              </Button>
            ) : null}
            {currentStatus === 'running' ? (
              <Button disabled={setTimer.isPending} onClick={() => act('pause')}>
                {t('timerPause')}
              </Button>
            ) : null}
            {currentStatus === 'paused' ? (
              <Button disabled={setTimer.isPending} onClick={() => act('resume')}>
                {t('timerResume')}
              </Button>
            ) : null}
            {currentStatus !== 'idle' ? (
              <Button
                variant="outline"
                disabled={setTimer.isPending}
                onClick={() => act('reset')}
              >
                {t('timerReset')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
