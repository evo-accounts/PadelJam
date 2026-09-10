'use client';
import Link from 'next/link';
import { eventStatusKey } from '@padel/api';
import { useT } from '@padel/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface EventCardEvent {
  id: string;
  name: string;
  starts_at: string | null;
  status: string;
  venue?: { name: string | null; address: string | null } | null;
  location_text?: string | null;
  manual_location_name?: string | null;
}

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
  return (
    <Link href={`/app/event/${event.id}`} className="block">
      <Card className="overflow-hidden py-0 transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-1 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{event.name}</span>
            <Badge variant="secondary">{t(eventStatusKey(event.status, event.starts_at))}</Badge>
          </div>
          {when ? <span className="text-sm text-muted-foreground">{when}</span> : null}
          <span className="truncate text-sm text-muted-foreground">{where}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
