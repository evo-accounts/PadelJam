'use client';
/**
 * All of a group's events (UX-GRP-05), from "See all" on the group page. Upcoming first, Past on
 * the second tab; each card opens the event. "Create event" sits at the top for anyone the
 * community allows to create one, and each tab has its own empty state.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCanCreateEvent, useGroup, useGroupEvents } from '@padel/api';
import { useT } from '@padel/i18n';
import { EventCard, type EventCardEvent } from '@/components/event/EventCard';
import { GroupEmpty } from '@/components/group/GroupEmpty';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function GroupEventsPage() {
  const { t } = useT('group');
  const { id } = useParams<{ id: string }>();
  const { data: group } = useGroup(id);
  const events = useGroupEvents(id);
  const { data: canCreate } = useCanCreateEvent(id);
  // Fixed at mount: "upcoming" is relative to when the page opened (React Compiler purity).
  const [now] = useState(() => Date.now());

  const all = events.data ?? [];
  const upcoming = all.filter(
    (e) => e.status === 'scheduled' && e.starts_at != null && new Date(e.starts_at).getTime() >= now,
  );
  // Past, most recent first: everything that is not still ahead of us.
  const past = all.filter((e) => !upcoming.includes(e)).reverse();
  const mayCreate = !!canCreate && !group?.archived_at;

  const list = (rows: typeof all, tab: 'upcoming' | 'past') =>
    events.isLoading ? (
      <Skeleton className="h-24 w-full" />
    ) : rows.length === 0 ? (
      <GroupEmpty
        title={tab === 'upcoming' ? t('upcomingEmptyTitle') : t('pastEmptyTitle')}
        body={tab === 'upcoming' ? t('groupEventsEmptyBody') : t('pastEmptyBody')}
        testId={`empty-group-events-${tab}`}
      />
    ) : (
      <div className="flex flex-col gap-2">
        {rows.map((e) => (
          <EventCard key={e.id} event={e as unknown as EventCardEvent} />
        ))}
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <GroupPageTitle title={t('eventsTitle')} fallbackHref={`/app/group/${id}`} subtitle={group?.name} />
      {mayCreate && group ? (
        <Button asChild variant="outline" className="self-start" data-testid="group-events-create">
          <Link href={`/app/community/${group.community_id}/event-create?groupId=${id}`}>
            {t('groupEventsEmptyCta')}
          </Link>
        </Button>
      ) : null}
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">{t('upcomingTab')}</TabsTrigger>
          <TabsTrigger value="past">{t('pastTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="pt-3">
          {list(upcoming, 'upcoming')}
        </TabsContent>
        <TabsContent value="past" className="pt-3">
          {list(past, 'past')}
        </TabsContent>
      </Tabs>
    </div>
  );
}
