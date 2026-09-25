/**
 * "Add to calendar" (UX-JEVT-03/06, decision 11): the OS's own event editor, pre-filled, so the
 * user picks the calendar and saves — we never write to a calendar silently.
 *
 * `expo-calendar/legacy` because the new API has no system-UI equivalent yet. iOS 17+ presents the
 * editor with no permission at all; older iOS needs calendar access first, so a permission error
 * is answered by asking once and retrying.
 */
import * as Calendar from 'expo-calendar/legacy';

export type CalendarEventInput = {
  title: string;
  startsAt: string;
  durationMinutes: number;
  location?: string | null;
  notes?: string | null;
};

export type AddToCalendarResult = 'saved' | 'canceled' | 'denied' | 'error';

export async function addToCalendar(e: CalendarEventInput): Promise<AddToCalendarResult> {
  const start = new Date(e.startsAt);
  const data = {
    title: e.title,
    startDate: start,
    endDate: new Date(start.getTime() + e.durationMinutes * 60_000),
    location: e.location ?? undefined,
    notes: e.notes ?? undefined,
  };
  const present = async (): Promise<AddToCalendarResult> => {
    const r = await Calendar.createEventInCalendarAsync(data);
    return r.action === 'canceled' || r.action === 'deleted' ? 'canceled' : 'saved';
  };
  try {
    return await present();
  } catch {
    try {
      const { granted } = await Calendar.requestCalendarPermissionsAsync();
      if (!granted) return 'denied';
      return await present();
    } catch {
      return 'error';
    }
  }
}
