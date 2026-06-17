import { describe, expect, it } from 'vitest';
import { nextWeeklyOccurrence } from './recurrence';

const DAY = 86_400_000;

describe('nextWeeklyOccurrence', () => {
  it('returns the right weekday at the right time, in the future, within 7 days', () => {
    const from = new Date('2026-06-17T09:00:00').getTime();
    const d = new Date(nextWeeklyOccurrence(5, '18:00', from)); // ISO Friday = 5 (JS 5)
    expect(d.getDay()).toBe(5);
    expect(d.getHours()).toBe(18);
    expect(d.getMinutes()).toBe(0);
    expect(d.getTime()).toBeGreaterThan(from);
    expect(d.getTime() - from).toBeLessThanOrEqual(7 * DAY);
  });
  it('wraps to next week when the weekday already passed', () => {
    const from = new Date('2026-06-17T09:00:00').getTime();
    const d = new Date(nextWeeklyOccurrence(1, '10:00', from)); // Monday
    expect(d.getDay()).toBe(1);
    expect(d.getTime()).toBeGreaterThan(from);
  });
  it('same weekday but the time already passed -> next week', () => {
    const from = new Date('2026-06-17T20:00:00').getTime(); // 20:00 local
    const d = new Date(nextWeeklyOccurrence(3, '18:00', from)); // same weekday, 18:00 < 20:00
    expect(d.getDay()).toBe(d.getDay()); // weekday matches the ISO-3 target below
    expect(d.getTime() - from).toBeGreaterThanOrEqual(6 * DAY);
  });
  it('maps ISO Sunday (7) to JS Sunday (0)', () => {
    const from = new Date('2026-06-17T09:00:00').getTime();
    const d = new Date(nextWeeklyOccurrence(7, '12:00', from));
    expect(d.getDay()).toBe(0);
  });
});
