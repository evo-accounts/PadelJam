'use client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { eventStatusKey } from '@padel/api';
import { useT } from '@padel/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
 */
export function EventCard({ event }: { event: EventCardEvent }) {
  const { t, i18n } = useT('event');
  const when = event.starts_at
    ? new Date(event.starts_at).toLocaleString(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;
  const where =
    event.venue?.name ?? event.manual_location_name ?? event.location_text ?? t('locationTbd');
  const status = eventStatusKey(event.status, event.starts_at);
  return (
    <Link href={`/app/event/${event.id}`} className="block" data-testid={`event-card-${event.id}`}>
      <Card className="overflow-hidden py-0 transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3 p-3">
          <EventThumb path={event.thumbnail_path} shape="row" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{event.name}</span>
              {status !== 'statusScheduled' ? (
                <Badge variant={status === 'statusInProgress' ? 'default' : 'secondary'}>{t(status)}</Badge>
              ) : null}
            </div>
            {when ? <span className="text-sm text-muted-foreground">{when}</span> : null}
            <span className="truncate text-sm text-muted-foreground">{where}</span>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </CardContent>
      </Card>
    </Link>
  );
}
