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
  usePostEventResult,
} from '@padel/api';
import { setupComplete } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MatchesTab } from '@/components/event/live/MatchesTab';
import { Leaderboard } from '@/components/event/live/Leaderboard';
import { MatchTimer } from '@/components/event/live/MatchTimer';
import { FinishDialog } from '@/components/event/live/FinishDialog';

export default function EventLivePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const teams = useEventTeams(id);
  const start = useStartEvent(id);
  const postResult = usePostEventResult(id);
  const [err, setErr] = useState<string | null>(null);
  const [shareErr, setShareErr] = useState<string | null>(null);

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data) return <div className="p-6">{t('notAvailable')}</div>;

  const e = event.data;
  const parts = participants.data ?? [];
  const isOrganizer = uid != null && e.organizer_id === uid;
  const isParticipant = parts.some((p) => p.user_id === uid);
  const canScore = isOrganizer || (e.players_submit_results && isParticipant);
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
        specification: e.specification,
        confirmedParticipantIds: confirmed.map((p) => p.id),
        numCourts: e.num_courts,
      })
      .catch((x) => setErr(t(x instanceof Error ? x.message : 'unknown_error')));
  };

  const backLink = (
    <Button asChild variant="tertiary" className="self-start">
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
    return (
      <div className="flex flex-col gap-4 p-6">
        {backLink}
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              {t('readyToStart', { confirmed: confirmed.length, needed: e.num_courts * 4 })}
            </p>
            {/* Team events: the pairs are built in Manage players' Teams tab (UX-MEVT-14), not here. */}
            {e.specification === 'team' ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground" data-testid="live-teams-complete">
                  {t('dashTeamsComplete', { count: confirmedTeamCount })}
                </span>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/app/event/${id}/manage/players`} data-testid="live-manage-teams">
                    {t('tmManageTeamsCta')}
                  </Link>
                </Button>
              </div>
            ) : null}
            <Button disabled={!ready || start.isPending} onClick={onStart}>
              {t('startCta')}
            </Button>
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (e.status === 'completed') {
    const onShare = () => {
      setShareErr(null);
      // events row has no `community_id` (it carries `group_id`); the arg is only
      // used for post-cache invalidation, so we pass '' per the contract fallback.
      postResult
        .mutateAsync('')
        .catch((x) => setShareErr(t(x instanceof Error ? x.message : 'unknown_error')));
    };
    return (
      <div className="flex flex-col gap-4 p-6">
        {backLink}
        <h1 className="text-xl font-semibold">{t('completedTitle')}</h1>
        <Leaderboard eventId={id} />
        {e.finish_message ? (
          <p className="text-sm text-muted-foreground">{e.finish_message}</p>
        ) : null}
        {isOrganizer ? (
          <div className="flex flex-col items-start gap-2">
            <Button disabled={postResult.isPending} onClick={onShare}>
              {t('shareResultsCta')}
            </Button>
            {shareErr ? <p className="text-sm text-destructive">{shareErr}</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {backLink}
      <h1 className="text-xl font-semibold">{t('liveTitle')}</h1>
      {isOrganizer ? (
        <FinishDialog eventId={id} countsForRanking={e.counts_for_ranking} />
      ) : null}
      <Tabs defaultValue="matches">
        <TabsList>
          <TabsTrigger value="matches">{t('matchesTab')}</TabsTrigger>
          <TabsTrigger value="leaderboard">{t('leaderboardTab')}</TabsTrigger>
          <TabsTrigger value="timer">{t('timerTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="matches">
          <MatchesTab eventId={id} canScore={canScore} isOrganizer={isOrganizer} />
        </TabsContent>
        <TabsContent value="leaderboard">
          <Leaderboard eventId={id} />
        </TabsContent>
        <TabsContent value="timer">
          <MatchTimer eventId={id} isOrganizer={isOrganizer} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
