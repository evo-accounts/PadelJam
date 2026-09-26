import { describe, expect, it } from 'vitest';

import { buildIcs, icsEscape, icsFileName, icsFold, icsUtc } from './ics';

const NOW = new Date('2026-09-26T10:00:00.000Z');
const base = {
  uid: 'evt-1@padeljam',
  title: 'Friday Americano',
  startsAt: '2026-10-02T18:30:00.000Z',
  durationMinutes: 90,
  now: NOW,
};

describe('icsUtc', () => {
  it('writes a basic-format UTC timestamp', () => {
    expect(icsUtc(new Date('2026-10-02T18:30:05.123Z'))).toBe('20261002T183005Z');
  });

  it('converts an offset time to UTC', () => {
    expect(icsUtc(new Date('2026-10-02T19:30:00+01:00'))).toBe('20261002T183000Z');
  });
});

describe('icsEscape', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(icsEscape('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });
});

describe('icsFold', () => {
  it('leaves a short line alone', () => {
    expect(icsFold('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds at 75 octets with a leading space on each continuation', () => {
    const folded = icsFold(`DESCRIPTION:${'x'.repeat(200)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toHaveLength(75);
    for (const l of lines.slice(1)) {
      expect(l.startsWith(' ')).toBe(true);
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    }
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(`DESCRIPTION:${'x'.repeat(200)}`);
  });

  it('never splits a multi-byte character', () => {
    const line = `SUMMARY:${'ã'.repeat(80)}`;
    const lines = icsFold(line).split('\r\n');
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(line);
  });
});

describe('buildIcs', () => {
  it('builds one VEVENT with UTC start and end from the duration', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
    expect(ics).toContain('\r\nBEGIN:VEVENT\r\n');
    expect(ics).toContain('\r\nUID:evt-1@padeljam\r\n');
    expect(ics).toContain('\r\nDTSTAMP:20260926T100000Z\r\n');
    expect(ics).toContain('\r\nDTSTART:20261002T183000Z\r\n');
    expect(ics).toContain('\r\nDTEND:20261002T200000Z\r\n');
    expect(ics).toContain('\r\nSUMMARY:Friday Americano\r\n');
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
  });

  it('uses CRLF everywhere, never a bare LF', () => {
    expect(buildIcs({ ...base, description: 'line one\nline two' })).not.toMatch(/[^\r]\n/);
  });

  it('escapes location and description and leaves the URL as a URI', () => {
    const ics = buildIcs({
      ...base,
      location: 'Padel Club, Rua 1; Lisboa',
      description: 'Bring balls,\nand water',
      url: 'https://padeljam.app/app/event/1?x=a,b',
    });
    expect(ics).toContain('\r\nLOCATION:Padel Club\\, Rua 1\\; Lisboa\r\n');
    expect(ics).toContain('\r\nDESCRIPTION:Bring balls\\,\\nand water\r\n');
    expect(ics).toContain('\r\nURL:https://padeljam.app/app/event/1?x=a,b\r\n');
  });

  it('omits optional properties that are empty', () => {
    const ics = buildIcs({ ...base, location: null, description: '' });
    expect(ics).not.toContain('LOCATION:');
    expect(ics).not.toContain('DESCRIPTION:');
    expect(ics).not.toContain('URL:');
  });

  it('refuses an unparseable start', () => {
    expect(() => buildIcs({ ...base, startsAt: 'nope' })).toThrow('invalid_start');
  });
});

describe('icsFileName', () => {
  it('slugs the title without accents', () => {
    expect(icsFileName('Americano de Sexta — Açores!')).toBe('americano-de-sexta-acores.ics');
  });

  it('falls back to event.ics', () => {
    expect(icsFileName('🎾')).toBe('event.ics');
  });
});
