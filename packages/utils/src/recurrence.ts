/**
 * ISO timestamp of the next weekly slot strictly after `fromMs`.
 * @param dayOfWeek 1=Mon … 7=Sun (ISO, as stored on event_series.day_of_week)
 * @param startTime 'HH:MM' (interpreted in local time, for display)
 */
export function nextWeeklyOccurrence(dayOfWeek: number, startTime: string, fromMs: number): string {
  const [h, m] = startTime.split(':').map((s) => Number(s));
  const from = new Date(fromMs);
  const targetJsDay = dayOfWeek === 7 ? 0 : dayOfWeek; // ISO 1..7 -> JS 0..6
  let dayDiff = (targetJsDay - from.getDay() + 7) % 7;
  const candidate = new Date(from);
  candidate.setHours(h ?? 0, m ?? 0, 0, 0);
  if (dayDiff === 0 && candidate.getTime() <= fromMs) dayDiff = 7;
  candidate.setDate(from.getDate() + dayDiff);
  candidate.setHours(h ?? 0, m ?? 0, 0, 0); // re-apply after date shift (DST-safe)
  return candidate.toISOString();
}
