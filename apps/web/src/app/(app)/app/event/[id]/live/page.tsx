'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  type EventType,
  useEvent,
  useEventParticipants,
  useEventTeams,
  useEventRealtime,
  useStartEvent,
} from '@padel/api';
import { setupComplete } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function EventLivePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const teams = useEventTeams(id);
  const start = useStartEvent(id);
  const [err, setErr] = useState<string | null>(null);

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data) return <div className="p-6">{t('notAvailable')}</div>;

  const e = event.data;
  const parts = participants.data ?? [];
  const isOrganizer = uid != null && e.organizer_id === uid;
  const confirmed = parts.filter((p) => p.status === 'confirmed');
  const confirmedTeamCount = (teams.data ?? []).filter((tm) => tm.is_confirmed).length;
  const ready = setupComplete({
    specification: e.specification,
    confirmedCount: confirmed.length,
    confirmedTeamCount,
    numCourts: e.num_courts,
  });

  const onStart = () => {
    setErr(null);
    start
      .mutateAsync({
        eventType: e.event_type as EventType,
        confirmedParticipantIds: confirmed.map((p) => p.id),
        numCourts: e.num_courts,
      })
      .catch((x) => setErr(t(x instanceof Error ? x.message : 'unknown_error')));
  };

  const backLink = (
    <Button asChild variant="ghost" className="self-start">
      <Link href={`/app/event/${id}`}>{t('backToEvent')}</Link>
    </Button>
  );

  if (e.status === 'scheduled') {
    if (!isOrganizer) {
      return (
        <div className="flex flex-col gap-4 p-6">
          {backLink}
          <p className="text-sm text-muted-foreground">{t('waitingToStart')}</p>
        </div>
      );
    }
    if (e.specification === 'team') {
      return (
        <div className="flex flex-col gap-4 p-6">
          {backLink}
          {/* Task 4 renders <TeamSetup eventId={id} numCourts={e.num_courts} canStart={ready} starting={start.isPending} onStart={onStart} /> */}
          <p className="text-sm text-muted-foreground">{t('assignTitle')}</p>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4 p-6">
        {backLink}
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              {t('readyToStart', { confirmed: confirmed.length, needed: e.num_courts * 4 })}
            </p>
            <Button disabled={!ready || start.isPending} onClick={onStart}>
              {t('startCta')}
            </Button>
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {backLink}
      <h1 className="text-xl font-semibold">
        {e.status === 'completed' ? t('completedTitle') : t('liveTitle')}
      </h1>
      {/* Tasks 5-7: in_progress tabs (matches/leaderboard/timer) + finish; completed view + share */}
    </div>
  );
}
