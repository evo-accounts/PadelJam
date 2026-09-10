/**
 * The status badge shown on an event, derived from `status` AND the clock.
 *
 * `status` alone is not enough. Nothing moves an event from 'scheduled' to
 * 'in_progress' except the organizer explicitly starting it — there is no cron
 * — so between the start time and that tap the row is still, literally,
 * 'scheduled'. Labelling that "Upcoming" is wrong in the one moment the label
 * matters most: the organizer is standing on the court at 19:01 looking at a
 * 19:00 event that claims it has not happened yet.
 *
 * my_events keeps such an event listed for its booked slot plus a grace window
 * (migration 0090), so this state is on screen regularly and needs its own
 * word rather than borrowing the wrong one.
 */
export type EventStatusKey =
  | 'statusScheduled'
  | 'statusStartingNow'
  | 'statusInProgress'
  | 'statusCompleted';

/**
 * Map an event row to its i18n status-badge key.
 *
 * @param status    the raw `events.status` value
 * @param startsAt  the raw `events.starts_at` timestamp; null/unparseable is
 *                  treated as "no start time to be past", i.e. plain scheduled
 */
export function eventStatusKey(status: string, startsAt?: string | null): EventStatusKey {
  if (status === 'in_progress') return 'statusInProgress';
  if (status === 'completed') return 'statusCompleted';
  if (status === 'scheduled' && startsAt) {
    const t = Date.parse(startsAt);
    if (Number.isFinite(t) && t <= Date.now()) return 'statusStartingNow';
  }
  return 'statusScheduled';
}
