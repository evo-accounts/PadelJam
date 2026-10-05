'use client';
/**
 * Activity (UX-MEVT-17) — a full page, reached from the dashboard's Activity card. Organizer only:
 * anyone else gets the same "not available" note as the other Manage pages. Entries are written
 * server-side (decision 15), so the list refreshes on the event's realtime channel.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useEvent, useEventActivity, useEventRealtime } from '@padel/api';
import { ActivityFeed } from '@/components/event/manage/ActivityFeed';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { Skeleton } from '@/components/ui/skeleton';

export default function EventActivityPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const isOrganizer = event.data != null && uid != null && event.data.organizer_id === uid;
  const activity = useEventActivity(id);
  // "5 min ago" keeps moving while the page stays open.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(h);
  }, []);

  const back = `/app/event/${id}/manage`;
  const title = t('activityTitle');

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isOrganizer) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <GroupPageTitle title={title} fallbackHref={back} />
        <p className="p-8 text-center text-sm text-muted-foreground" data-testid="activity-forbidden">
          {t('forbidden')}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <GroupPageTitle title={title} fallbackHref={back} />
      {activity.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : activity.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('unknown_error')}
        </p>
      ) : (
        <ActivityFeed rows={activity.data ?? []} nowMs={nowMs} />
      )}
    </div>
  );
}
