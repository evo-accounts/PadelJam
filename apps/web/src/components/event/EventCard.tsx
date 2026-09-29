'use client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { eventStatusKey, type MyEventStatus } from '@padel/api';
import { useT } from '@padel/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { eventWhen } from './EventDetailParts';
import { EventThumb } from './EventThumb';

export interface EventCardEvent {
  id: string;
  name: string;
  starts_at: string | null;
  status: string;
  thumbnail_path?: string | null;
  venue?: { name: string | null; address: string | null } | null;
  location_text?: string | null;
  manual_location_name?: string | null;
}

/**
 * One event in a list: thumbnail (or an icon placeholder), name, date and place (UX-JEVT-01).
 *
 * No badge for an upcoming event: every listed event is upcoming, so "Scheduled" said nothing.
 * Starting now / Live / Completed still carry meaning and keep theirs.
 *
 * `viewerStatus` labels an event the viewer holds no spot in yet — on the waiting list, or
 * interested (a team player without a partner). Since migration 0112 those events are listed under
 * Going, and without a label they would read as a held spot. Mobile's EventCard does the same.
 *
 * `orientation` follows UX-GLOB-09: `horizontal` (the default) is the full-width row for a list,
 * `vertical` the fixed-width card for a horizontally scrolling rail (Home's Next Events) —
 * thumbnail on top, same content below.
 */
export function EventCard({
  event,
  viewerStatus,
  orientation = 'horizontal',
}: {
  event: EventCardEvent;
  viewerStatus?: MyEventStatus;
  orientation?: 'horizontal' | 'vertical';
}) {
  const { t, i18n } = useT('event');
  // The same 24h `Sat, 3 Oct · 19:00` as the event page, never the locale's 12h "7:00 PM".
  const when = event.starts_at ? eventWhen(event.starts_at, i18n.language) : null;
  const where =
    event.venue?.name ?? event.manual_location_name ?? event.location_text ?? t('locationTbd');
  const status = eventStatusKey(event.status, event.starts_at);
  const statusBadge =
    status !== 'statusScheduled' ? (
      <Badge variant={status === 'statusInProgress' ? 'default' : 'secondary'}>{t(status)}</Badge>
    ) : null;
  const viewerBadge = viewerStatus ? (
    <Badge
      className={
        viewerStatus === 'waiting_list'
          ? 'bg-warning text-warning-foreground'
          : 'bg-info text-info-foreground'
      }
      data-testid={`event-card-status-${event.id}`}
    >
      {viewerStatus === 'waiting_list' ? t('cardWaitingList') : t('cardInterested')}
    </Badge>
  ) : null;

  if (orientation === 'vertical') {
    return (
      <Link
        href={`/app/event/${event.id}`}
        className="block w-60 shrink-0 snap-start rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-testid={`event-card-${event.id}`}
      >
        <Card className="h-full gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
          <EventThumb path={event.thumbnail_path} shape="card" />
          <CardContent className="flex flex-col items-start gap-1 p-3">
            <span className="line-clamp-2 font-medium">{event.name}</span>
            {when ? <span className="text-sm text-muted-foreground">{when}</span> : null}
            <span className="w-full truncate text-sm text-muted-foreground">{where}</span>
            {statusBadge || viewerBadge ? (
              <span className="flex flex-wrap gap-1 pt-0.5">
                {statusBadge}
                {viewerBadge}
              </span>
            ) : null}
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/app/event/${event.id}`} className="block" data-testid={`event-card-${event.id}`}>
      <Card className="overflow-hidden py-0 transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3 p-3">
          <EventThumb path={event.thumbnail_path} shape="row" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{event.name}</span>
              {statusBadge}
            </div>
            {when ? <span className="text-sm text-muted-foreground">{when}</span> : null}
            <span className="truncate text-sm text-muted-foreground">{where}</span>
            {viewerBadge}
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </CardContent>
      </Card>
    </Link>
  );
}
