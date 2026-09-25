/**
 * A one-event iCalendar file (RFC 5545) — web's "Add to calendar" (UX-JEVT-03/06, decision 11).
 * Mobile opens the OS event editor instead; a browser has no such thing, so web downloads an .ics
 * that every calendar app imports.
 *
 * Times are written in UTC (`…Z`), so the file needs no VTIMEZONE and lands at the right moment in
 * whatever zone the calendar app is in. Text values are escaped and long lines folded as the RFC
 * requires — an unescaped comma or newline in a description silently truncates it in some apps.
 */
export type IcsEventInput = {
  /** Stable per event, so importing twice updates the same entry instead of duplicating it. */
  uid: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  /** DTSTAMP; defaults to now. Passed in by tests. */
  now?: Date;
};

const CRLF = '\r\n';

/** `20260620T180000Z` */
export function icsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** TEXT escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, and newlines as `\n`. */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/**
 * Folds a content line at 75 octets (§3.1): continuation lines start with one space. Splits
 * between code points, never inside a multi-byte character.
 */
export function icsFold(line: string): string {
  if (utf8Length(line) <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = utf8Length(ch);
    if (bytes + n > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // the leading space of a continuation line counts
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

export function buildIcs(e: IcsEventInput): string {
  const start = new Date(e.startsAt);
  if (Number.isNaN(start.getTime())) throw new Error('invalid_start');
  const end = new Date(start.getTime() + Math.max(0, e.durationMinutes) * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PadelJam//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(e.uid)}`,
    `DTSTAMP:${icsUtc(e.now ?? new Date())}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    // URI values are not TEXT: no escaping.
    ...(e.url ? [`URL:${e.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(icsFold).join(CRLF) + CRLF;
}

/** A safe file name for the download: letters, digits and dashes only. */
export function icsFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'event'}.ics`;
}
