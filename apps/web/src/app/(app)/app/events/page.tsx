'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useMyEvents, type MyEventsFilter } from '@padel/api';
import { EventCard, type EventCardEvent } from '@/components/event/EventCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

function EventList({ filter }: { filter: MyEventsFilter }) {
  const { t } = useT('event');
  const q = useMyEvents(filter);
  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  const rows = (q.data?.pages.flat() ?? []) as EventCardEvent[];
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t('emptyEvents')}</p>;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
      {q.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={q.isFetchingNextPage}
          onClick={() => q.fetchNextPage()}
        >
          {t('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}

export default function EventsPage() {
  const { t } = useT('event');
  const [tab, setTab] = useState<MyEventsFilter>('all');
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Tabs value={tab} onValueChange={(v) => setTab(v as MyEventsFilter)}>
        <TabsList>
          <TabsTrigger value="all">{t('filterAll')}</TabsTrigger>
          <TabsTrigger value="organizing">{t('filterOrganizing')}</TabsTrigger>
          <TabsTrigger value="going">{t('filterGoing')}</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="pt-4">
          <EventList filter="all" />
        </TabsContent>
        <TabsContent value="organizing" className="pt-4">
          <EventList filter="organizing" />
        </TabsContent>
        <TabsContent value="going" className="pt-4">
          <EventList filter="going" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
