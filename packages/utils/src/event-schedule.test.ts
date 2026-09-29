import { describe, expect, it } from 'vitest';
import {
  atTime,
  dayStrip,
  defaultStart,
  eventCapacity,
  formatEventWhen,
  inviteDate,
  isDurationPreset,
  isPastSlot,
  nextFutureWeekly,
  nextWeekly,
  parseHHMM,
  parseWholeInRange,
  periodOf,
  timeOf,
  timeSlots,
} from './event-schedule';

describe('timeSlots', () => {
  it('offers half-hour starts per period, 07:00 to 23:00, with no gaps or overlaps', () => {
    expect(timeSlots('morning')).toEqual([
      '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    ]);
    expect(timeSlots('afternoon')[0]).toBe('12:00');
    expect(timeSlots('afternoon').at(-1)).toBe('17:30');
    expect(timeSlots('evening')).toEqual([
      '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00',
    ]);
  });

  it('places a time in its period', () => {
    expect(periodOf('06:00')).toBe('morning');
    expect(periodOf('11:45')).toBe('morning');
    expect(periodOf('12:00')).toBe('afternoon');
    expect(periodOf('17:59')).toBe('afternoon');
    expect(periodOf('18:00')).toBe('evening');
    expect(periodOf('23:30')).toBe('evening');
  });

  it('parses only real HH:MM times', () => {
    expect(parseHHMM('09:30')).toBe(570);
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('9:30')).toBeNull();
  });
});

describe('atTime / isPastSlot', () => {
  const day = new Date(2026, 9, 3, 15, 12); // Sat 3 Oct 2026, 15:12 local

  it('keeps the calendar day and sets the wall-clock time', () => {
    const d = atTime(day, '18:30');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), timeOf(d)]).toEqual([2026, 9, 3, '18:30']);
  });

  it('marks slots at or before now as past, only on that day', () => {
    expect(isPastSlot(day, '15:00', day)).toBe(true);
    expect(isPastSlot(day, '15:30', day)).toBe(false);
    expect(isPastSlot(new Date(2026, 9, 4), '07:00', day)).toBe(false);
  });
});

describe('defaultStart', () => {
  it('is the first slot at least an hour out', () => {
    expect(timeOf(defaultStart(new Date(2026, 9, 3, 15, 12)))).toBe('16:30');
    expect(timeOf(defaultStart(new Date(2026, 9, 3, 15, 0)))).toBe('16:00');
  });

  it('rolls over to the next morning when today has no slot left', () => {
    const d = defaultStart(new Date(2026, 9, 3, 22, 30));
    expect([d.getDate(), timeOf(d)]).toEqual([4, '07:00']);
  });

  it('opens on the first morning slot in the small hours', () => {
    const d = defaultStart(new Date(2026, 9, 3, 2, 0));
    expect([d.getDate(), timeOf(d)]).toEqual([3, '07:00']);
  });
});

describe('dayStrip', () => {
  it('labels the first day and every day that starts a new month', () => {
    const strip = dayStrip(new Date(2026, 8, 28, 20, 0), 40); // 28 Sep → 6 Nov
    const marked = strip.filter((d) => d.showMonth).map((d) => [d.date.getMonth(), d.date.getDate()]);
    expect(marked).toEqual([
      [8, 28],
      [9, 1],
      [10, 1],
    ]);
    expect(strip).toHaveLength(40);
    expect(strip[0]!.date.getHours()).toBe(0);
  });

  it('crosses a year boundary', () => {
    const strip = dayStrip(new Date(2026, 11, 30), 4);
    expect(strip.map((d) => d.showMonth)).toEqual([true, false, true, false]);
    expect(strip[2]!.date.getFullYear()).toBe(2027);
  });
});

describe('duration', () => {
  it('knows its presets', () => {
    expect([60, 90, 120].every(isDurationPreset)).toBe(true);
    expect(isDurationPreset(75)).toBe(false);
  });

  it('parses a custom value within range', () => {
    expect(parseWholeInRange('75', 15, 480)).toBe(75);
    expect(parseWholeInRange(' 480 ', 15, 480)).toBe(480);
    expect(parseWholeInRange('14', 15, 480)).toBeNull();
    expect(parseWholeInRange('481', 15, 480)).toBeNull();
    expect(parseWholeInRange('1.5', 15, 480)).toBeNull();
    expect(parseWholeInRange('', 15, 480)).toBeNull();
  });
});

describe('recurrence', () => {
  it('next occurrence is the same wall-clock time a week later, across month ends', () => {
    const next = nextWeekly(new Date(2026, 9, 29, 19, 0));
    expect([next.getMonth(), next.getDate(), timeOf(next)]).toEqual([10, 5, '19:00']);
  });

  it('invites go out lead days before', () => {
    const d = inviteDate(new Date(2026, 9, 10, 19, 0), 5);
    expect([d.getMonth(), d.getDate()]).toEqual([9, 5]);
  });
});

describe('formatEventWhen', () => {
  it('names the day and the time range in 24-hour time', () => {
    const s = formatEventWhen(new Date(2026, 9, 3, 18, 0), 90, 'en-GB');
    expect(s).toBe('Saturday 3 October · 18:00–19:30');
  });

  it('is localised', () => {
    const s = formatEventWhen(new Date(2026, 9, 3, 18, 0), 60, 'pt-PT');
    expect(s).toMatch(/sábado/i);
    expect(s).toMatch(/outubro/i);
    expect(s).toMatch(/18:00–19:00$/);
  });
});

describe('eventCapacity', () => {
  it('is four players a court', () => {
    expect(eventCapacity(3, 'classic')).toEqual({ players: 12, perGender: null });
  });

  it('splits a mixed event evenly per gender', () => {
    expect(eventCapacity(4, 'mixed')).toEqual({ players: 16, perGender: 8 });
  });

  it('counts stand-by spots in the per-gender cap and rounds down, as the server does', () => {
    expect(eventCapacity(2, 'mixed', 4)).toEqual({ players: 8, perGender: 6 });
    expect(eventCapacity(2, 'mixed', 3)).toEqual({ players: 8, perGender: 5 });
    expect(eventCapacity(2, 'classic', 3)).toEqual({ players: 8, perGender: null });
  });
});

describe('nextFutureWeekly', () => {
  const now = new Date(2026, 8, 29, 12, 0);
  it('is one week on for an upcoming event', () => {
    const start = new Date(2026, 9, 2, 19, 0);
    expect(nextFutureWeekly(start, now)).toEqual(new Date(2026, 9, 9, 19, 0));
  });
  it('rolls a past event forward to the first future weekly slot, same wall-clock time', () => {
    const start = new Date(2026, 8, 1, 19, 0);
    expect(nextFutureWeekly(start, now)).toEqual(new Date(2026, 8, 29, 19, 0));
  });
});
