'use client';
/**
 * My events (UX-JEVT-01): All / Organizing / Going / Pending, with a "Show past events" toggle
 * above the tabs, off by default. Pending lists invitations not answered yet; the toggle adds
 * past events to every tab (events without a group have nowhere else to be seen). Both are served
 * by `my_events` (migration 0112).
 */
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useMyEvents, type MyEventsFilter } from '@padel/api';
import { EventCard, type EventCardEvent } from '@/components/event/EventCard';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const FILTERS: { key: MyEventsFilter; label: string }[] = [
  { key: 'all', label: 'filterAll' },
  { key: 'organizing', label: 'filterOrganizing' },
  { key: 'going', label: 'filterGoing' },
  { key: 'pending', label: 'filterPending' },
];

function EventList({ filter, includePast }: { filter: MyEventsFilter; includePast: boolean }) {
  const { t } = useT('event');
  const q = useMyEvents(filter, includePast);
  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (q.isError) {
    return (
      <div className="flex flex-col items-start gap-2" role="alert" data-testid={`events-error-${filter}`}>
        <p className="text-sm text-muted-foreground">{t('loadError')}</p>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          {t('retryCta')}
        </Button>
      </div>
    );
  }
  const rows = (q.data?.pages.flat() ?? []) as EventCardEvent[];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`events-empty-${filter}`}>
        {filter === 'pending' ? t('emptyPending') : includePast ? t('emptyEventsAny') : t('emptyEvents')}
      </p>
    );
  }
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
  const [includePast, setIncludePast] = useState(false);
  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <div className="flex items-center gap-2">
        <Switch
          id="events-show-past"
          checked={includePast}
          onCheckedChange={setIncludePast}
          data-testid="events-show-past"
        />
        <Label htmlFor="events-show-past">{t('showPastEvents')}</Label>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as MyEventsFilter)}>
        {/* Four tabs overflow a 375px screen in Portuguese: the list scrolls sideways instead. */}
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.key} value={f.key} className="flex-none">
              {t(f.label)}
            </TabsTrigger>
          ))}
        </TabsList>
        {FILTERS.map((f) => (
          <TabsContent key={f.key} value={f.key} className="pt-4">
            <EventList filter={f.key} includePast={includePast} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
