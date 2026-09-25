/**
 * "Add to calendar" (UX-JEVT-03/06, decision 11): the OS's own event editor, pre-filled, so the
 * user picks the calendar and saves — we never write to a calendar silently.
 *
 * `expo-calendar/legacy` because the new API has no system-UI equivalent yet (the main export's
 * `createEventInCalendarAsync` throws in v56). iOS 17+ presents the editor with no permission at
 * all; older iOS needs calendar access first. Android's editor is an Intent and needs none either,
 * which is why app.json blocks READ/WRITE_CALENDAR there.
 *
 * Permission is asked for only when it is actually missing — never as a reaction to some other
 * failure, which would put an irrelevant prompt in front of the user.
 */
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

export type CalendarEventInput = {
  title: string;
  startsAt: string;
  durationMinutes: number;
  location?: string | null;
  notes?: string | null;
};

export type AddToCalendarResult = 'saved' | 'canceled' | 'denied' | 'error';

/** iOS below 17 is the only platform whose editor refuses to open without calendar access. */
export function editorNeedsPermission(os: string, version: string | number): boolean {
  return os === 'ios' && parseInt(String(version), 10) < 17;
}

async function ensureAccess(): Promise<boolean> {
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Calendar.requestCalendarPermissionsAsync()).granted;
}

export async function addToCalendar(e: CalendarEventInput): Promise<AddToCalendarResult> {
  const start = new Date(e.startsAt);
  try {
    if (editorNeedsPermission(Platform.OS, Platform.Version) && !(await ensureAccess())) return 'denied';
    const r = await Calendar.createEventInCalendarAsync({
      title: e.title,
      startDate: start,
      endDate: new Date(start.getTime() + e.durationMinutes * 60_000),
      location: e.location ?? undefined,
      notes: e.notes ?? undefined,
    });
    return r.action === 'canceled' || r.action === 'deleted' ? 'canceled' : 'saved';
  } catch {
    return 'error';
  }
}
