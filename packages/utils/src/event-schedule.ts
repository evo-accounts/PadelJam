/**
 * The create-event Date and Courts steps (UX-CEVT-07, UX-CEVT-08), as pure functions so both apps
 * can share them and they can be tested without a renderer. Everything here works in the DEVICE's
 * local time — the organizer picks a wall-clock day and time — and turns into an ISO instant only
 * when it is stored on the draft.
 */

// --- Time of day -------------------------------------------------------------------------------

export type DayPeriod = 'morning' | 'afternoon' | 'evening';
export const DAY_PERIODS: readonly DayPeriod[] = ['morning', 'afternoon', 'evening'];

/** Start times are offered every half hour. */
export const SLOT_MINUTES = 30;

/**
 * Minutes after midnight of each period's first and last offered start. Padel clubs open early and
 * close late, so the day runs 07:00–23:00; a start outside it is not offered at all.
 */
const PERIOD_RANGES: Record<DayPeriod, readonly [number, number]> = {
  morning: [7 * 60, 11 * 60 + 30],
  afternoon: [12 * 60, 17 * 60 + 30],
  evening: [18 * 60, 23 * 60],
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes after midnight → 'HH:MM'. */
export function formatHHMM(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** 'HH:MM' → minutes after midnight, or null when it is not a valid time. */
export function parseHHMM(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** The start times a period's tab offers, in order ('07:00', '07:30', …). */
export function timeSlots(period: DayPeriod): string[] {
  const [from, to] = PERIOD_RANGES[period];
  const out: string[] = [];
  for (let m = from; m <= to; m += SLOT_MINUTES) out.push(formatHHMM(m));
  return out;
}

/** Which tab a time belongs to — the one opened first when the step shows an existing start. */
export function periodOf(hhmm: string): DayPeriod {
  const m = parseHHMM(hhmm) ?? 0;
  if (m < PERIOD_RANGES.afternoon[0]) return 'morning';
  if (m < PERIOD_RANGES.evening[0]) return 'afternoon';
  return 'evening';
}

/** A Date's local wall-clock time as 'HH:MM'. */
export function timeOf(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `day`'s calendar date at local time `hhmm`. */
export function atTime(day: Date, hhmm: string): Date {
  const m = parseHHMM(hhmm) ?? 0;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60, 0, 0);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** A slot already gone (or starting right now) on `day` — shown, but not pickable. */
export function isPastSlot(day: Date, hhmm: string, now: Date): boolean {
  return atTime(day, hhmm).getTime() <= now.getTime();
}

/**
 * The start the Date step opens on when the draft has none: the first offered slot at least
 * `leadMinutes` from now — later today, or the first morning slot of the next day that has one.
 */
export function defaultStart(now: Date, leadMinutes = 60): Date {
  const earliest = now.getTime() + leadMinutes * 60_000;
  const slots = DAY_PERIODS.flatMap(timeSlots);
  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    for (const s of slots) {
      const at = atTime(day, s);
      if (at.getTime() >= earliest) return at;
    }
  }
  // Unreachable — every day offers slots — but keeps the return type honest.
  return new Date(earliest);
}

// --- The day scroller --------------------------------------------------------------------------

/** How far ahead the day scroller reaches. Long enough to always cross at least one month. */
export const DAY_STRIP_LENGTH = 60;

export type StripDay = {
  date: Date;
  /**
   * The month's abbreviation goes inline in the row before this day: the first day shown, and
   * every 1st after it — the scroll has crossed into another month (UX-CEVT-08).
   */
  showMonth: boolean;
};

/** `count` consecutive local days from `from`'s date, with the month markers placed. */
export function dayStrip(from: Date, count = DAY_STRIP_LENGTH): StripDay[] {
  const out: StripDay[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const prev = out[out.length - 1]?.date;
    out.push({ date, showMonth: !prev || prev.getMonth() !== date.getMonth() });
  }
  return out;
}

// --- Duration ----------------------------------------------------------------------------------

/** Decision 9: 60 / 90 / 120 with 60 selected, plus Custom (15–480) in a sheet. */
export const DURATION_PRESETS = [60, 90, 120] as const;
export const DEFAULT_DURATION = 60;
export const DURATION_MIN = 15;
export const DURATION_MAX = 480;

export function isDurationPreset(minutes: number): boolean {
  return (DURATION_PRESETS as readonly number[]).includes(minutes);
}

/** A typed whole number within `[min, max]`, or null. The Custom sheets' parser. */
export function parseWholeInRange(text: string, min: number, max: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= min && n <= max ? n : null;
}

// --- Recurrence --------------------------------------------------------------------------------

/** When the next occurrence's invitation goes out: 1 week, 5 days or 3 days before it. */
export const INVITE_LEAD_OPTIONS = [7, 5, 3] as const;
export type InviteLeadDays = (typeof INVITE_LEAD_OPTIONS)[number];
export const DEFAULT_INVITE_LEAD: InviteLeadDays = 5;

/** A weekly event's next occurrence: the same local wall-clock time, seven calendar days on. */
export function nextWeekly(start: Date): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + 7);
  return d;
}

/**
 * The first weekly slot after `start` that is still in the future — the interim default date for
 * Duplicate, whose `starts_at` is required and must be in the future since migration 0122 (B8).
 * Always at least one week on, so a duplicate never lands on the original's own slot.
 */
export function nextFutureWeekly(start: Date, now: Date = new Date()): Date {
  let d = nextWeekly(start);
  while (d.getTime() <= now.getTime()) d = nextWeekly(d);
  return d;
}

/** The day `leadDays` before `occurrence` — when its invitation is sent. */
export function inviteDate(occurrence: Date, leadDays: number): Date {
  const d = new Date(occurrence);
  d.setDate(d.getDate() - leadDays);
  return d;
}

// --- Summary -----------------------------------------------------------------------------------

/** 'Saturday, 3 October' in `locale`. */
export function formatLongDay(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** 'Sat, 3 Oct' in `locale`. */
export function formatShortDay(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * The Date step's summary line: 'Saturday, 3 October · 18:00–19:30'. Times are 24-hour on every
 * locale, as the slot grid shows them.
 */
export function formatEventWhen(start: Date, durationMinutes: number, locale: string): string {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return `${formatLongDay(start, locale)} · ${timeOf(start)}–${timeOf(end)}`;
}

// --- Capacity ----------------------------------------------------------------------------------

export const PLAYERS_PER_COURT = 4;
/** Requirements (decision 9): 1–20 courts. */
export const COURTS_MIN = 1;
export const COURTS_MAX = 20;

/**
 * What the court count means for the roster (UX-CEVT-07): four players a court, and on a mixed
 * event half the spots per gender — every pair is one man and one woman (decision 8). The
 * per-gender cap counts stand-by spots too and rounds down, exactly as the join RPCs do
 * (0112: `floor((num_courts * 4 + standby) / 2)`), so the wizard never promises a spot the server
 * would refuse. Pass `standbySpots` only when stand-by is enabled.
 */
export function eventCapacity(
  numCourts: number,
  specification: string | undefined,
  standbySpots = 0,
): { players: number; perGender: number | null } {
  const players = Math.max(0, numCourts) * PLAYERS_PER_COURT;
  const standby = Math.max(0, standbySpots);
  return {
    players,
    perGender: specification === 'mixed' ? Math.floor((players + standby) / 2) : null,
  };
}
