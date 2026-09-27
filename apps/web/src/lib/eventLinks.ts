/**
 * The event page's outward actions on web (UX-JEVT-02/03/06): the event link and Share, Add to
 * calendar, and the Location card's maps link. Web's counterpart of mobile's `eventShare.ts`,
 * `eventCalendar.ts` and `eventLocation.ts`.
 *
 * - Share uses the browser's share sheet where there is one and copies the link otherwise
 *   (`shareText`, the group pattern). A private event's link lands a non-invitee on the
 *   no-access page (UX-JEVT-07).
 * - Add to calendar downloads an .ics built client-side (decision 11) — a browser has no calendar
 *   editor to open, and every calendar app imports the file.
 * - Maps opens Apple Maps on Apple devices and Google Maps elsewhere, in a new tab.
 */
import { useSyncExternalStore } from 'react';
import { buildIcs, icsFileName, mapsQuery, type EventPlace } from '@padel/utils';
import { shareText } from '@/lib/groupShare';

export function eventUrl(id: string): string {
  return `${window.location.origin}/app/event/${id}`;
}

export function shareEvent(id: string, name: string): Promise<'shared' | 'copied'> {
  return shareText(name, name, eventUrl(id));
}

export function downloadEventIcs(e: {
  id: string;
  name: string;
  starts_at: string;
  duration_minutes: number;
  description: string | null;
  place: EventPlace | null;
}): void {
  const ics = buildIcs({
    uid: `${e.id}@padeljam`,
    title: e.name,
    startsAt: e.starts_at,
    durationMinutes: e.duration_minutes,
    location: e.place ? mapsQuery(e.place) : null,
    description: e.description,
    url: eventUrl(e.id),
  });
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = icsFileName(e.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the click start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

const noopSubscribe = () => () => {};

function isAppleDevice(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform) || /iPhone|iPad|iPod|Macintosh/.test(nav.userAgent);
}

/** Apple Maps or Google Maps for the Location card — read after hydration, never during SSR. */
export function useIsAppleDevice(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== 'undefined' && isAppleDevice(),
    () => false,
  );
}
