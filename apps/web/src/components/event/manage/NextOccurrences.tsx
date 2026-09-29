'use client';
/**
 * "Next occurrences" (UX-MEVT-22, decision 5): on a recurring event, Manage Event lists the next
 * four weekly slots (`event_next_occurrences`), between the Activity card and the actions. Each is
 * a card with the date, the day and time, the location, a status label and a chevron:
 *
 *   Scheduled  materialised — its invitations are out; opens its own event page
 *   Upcoming   not yet; opens the occurrence preview (`occurrence?slot=`), whose settings menu
 *              edits its date & time, sends its invitation now or cancels it
 *
 * Web's twin of mobile's `NextOccurrences`.
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useEventNextOccurrences, type EventOccurrence } from '@padel/api';
import { Badge } from '@/components/ui/badge';

/** "Fri, 9 Oct" and "Friday · 18:00", in the app's language. */
export function occurrenceWhen(iso: string, lang: string): { date: string; dayTime: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
  const day = d.toLocaleDateString(lang, { weekday: 'long' });
  const time = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
  return { date, dayTime: `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}` };
}

export function occurrencePlace(o: Pick<EventOccurrence, 'location_name' | 'location_address'>): string | null {
  return o.location_name ?? o.location_address ?? null;
}

export function NextOccurrences({ eventId }: { eventId: string }) {
  const { t, i18n } = useT('event');
  const { data } = useEventNextOccurrences(eventId);
  const rows = data ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="manage-occurrences-title" data-testid="manage-occurrences">
      <h2 id="manage-occurrences-title" className="pt-2 font-semibold">
        {t('nextOccurrencesTitle')}
      </h2>
      {rows.map((o) => {
        const when = occurrenceWhen(o.starts_at, i18n.language);
        const place = occurrencePlace(o) ?? t('noLocationValue');
        const scheduled = o.status === 'scheduled' && o.event_id != null;
        const status = t(scheduled ? 'occurrenceScheduled' : 'occurrenceUpcoming');
        const href = scheduled ? `/app/event/${o.event_id}` : `/app/event/${eventId}/occurrence?slot=${o.slot_date}`;
        return (
          <Link
            key={o.slot_date}
            href={href}
            aria-label={[when.date, when.dayTime, place, status].join(', ')}
            className="flex flex-col gap-1 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid={`manage-occurrence-${o.slot_date}`}
          >
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{when.date}</span>
              <Badge variant={scheduled ? 'default' : 'secondary'}>{status}</Badge>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </span>
            <span className="text-sm text-muted-foreground">{when.dayTime}</span>
            <span className="truncate text-sm text-muted-foreground">{place}</span>
          </Link>
        );
      })}
    </section>
  );
}
