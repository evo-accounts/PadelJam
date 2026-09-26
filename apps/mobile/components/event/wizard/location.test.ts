import { describe, expect, it } from 'vitest';

import { defaultDraft, type EventDraft } from './draft';
import {
  backToVenueList,
  chooseVenue,
  noLocation,
  normalizeCourtNames,
  openManualVenue,
  setCourtSelection,
  setManualCourtCount,
  setManualCourtName,
  toggleCourt,
} from './location';
import { isManualVenue, visibleStepKeys } from '@padel/utils';

const apply = (d: EventDraft, p: Partial<EventDraft>): EventDraft => ({ ...d, ...p });
const venue = { id: 'v1', name: 'Club', address: 'Rua 1' };

describe('Location answers (UX-CEVT-06)', () => {
  it('a registry venue keeps Courts on the path and clears manual leftovers', () => {
    const manual = apply(apply(defaultDraft, openManualVenue(defaultDraft)), {
      manualLocationAddress: 'Somewhere',
      manualCourtNames: ['A'],
    });
    const d = apply(manual, chooseVenue(manual, venue));
    expect(d).toMatchObject({ locationMode: 'registry', venueId: 'v1', hasLocation: true, manualLocationName: 'Club' });
    expect(d.manualCourtNames).toBeUndefined();
    expect(visibleStepKeys(d)).toContain('courts');
  });

  it('re-picking the same venue keeps its ticked courts; another venue forgets them', () => {
    const d = apply(apply(defaultDraft, chooseVenue(defaultDraft, venue)), { courtIds: ['c1'] });
    expect(chooseVenue(d, venue).courtIds).toEqual(['c1']);
    expect(chooseVenue(d, { ...venue, id: 'v2' }).courtIds).toBeUndefined();
  });

  it('a manual venue skips Courts; no location keeps it', () => {
    const manual = apply(defaultDraft, openManualVenue(defaultDraft));
    expect(isManualVenue(manual)).toBe(true);
    expect(visibleStepKeys(manual)).not.toContain('courts');
    const none = apply(manual, noLocation());
    expect(none).toMatchObject({ locationMode: 'none', hasLocation: false, venueId: undefined });
    expect(visibleStepKeys(none)).toContain('courts');
  });

  it('re-opening the manual form keeps what was typed', () => {
    const d = apply(apply(defaultDraft, openManualVenue(defaultDraft)), { manualLocationAddress: 'Rua 2' });
    expect(openManualVenue(d)).toEqual({});
  });

  it('back to the list chooses nothing', () => {
    const d = apply(apply(defaultDraft, openManualVenue(defaultDraft)), { manualLocationAddress: 'x' });
    const back = apply(d, backToVenueList());
    expect(back.locationMode).toBeUndefined();
    expect(back.hasLocation).toBe(false);
    expect(back.manualLocationAddress).toBeUndefined();
  });
});

describe('manual courts', () => {
  it('clamps to 1–20 and trims names to the count', () => {
    const d = { ...defaultDraft, numCourts: 3, manualCourtNames: ['A', 'B', 'C'] };
    expect(setManualCourtCount(d, 2)).toEqual({ numCourts: 2, manualCourtNames: ['A', 'B'] });
    expect(setManualCourtCount(d, 0).numCourts).toBe(1);
    expect(setManualCourtCount(d, 25).numCourts).toBe(20);
  });

  it('names one court without disturbing the others', () => {
    const d = { ...defaultDraft, numCourts: 3 };
    expect(setManualCourtName(d, 1, 'Centre')).toEqual({ manualCourtNames: ['', 'Centre', ''] });
  });
});

describe('venue courts (UX-CEVT-07)', () => {
  it('the court count follows the ticked courts', () => {
    let d = apply(defaultDraft, setCourtSelection(defaultDraft, true));
    expect(d.courtIds).toEqual([]);
    d = apply(d, toggleCourt(d, 'a'));
    d = apply(d, toggleCourt(d, 'b'));
    expect([d.courtIds, d.numCourts]).toEqual([['a', 'b'], 2]);
    d = apply(d, toggleCourt(d, 'a'));
    expect([d.courtIds, d.numCourts]).toEqual([['b'], 1]);
  });

  it('"Have not reserved yet" drops the selection and keeps the count', () => {
    const d = { ...defaultDraft, courtIds: ['a', 'b'], numCourts: 2 };
    expect(setCourtSelection(d, false)).toEqual({ courtIds: undefined, numCourts: 2 });
  });
});

describe('normalizeCourtNames (0113 manual_court_names)', () => {
  const court = (n: number) => `Court ${n}`;

  it('sends nothing when no court was named', () => {
    expect(normalizeCourtNames({ numCourts: 3, manualCourtNames: undefined }, court)).toBeUndefined();
    expect(normalizeCourtNames({ numCourts: 2, manualCourtNames: ['', '  '] }, court)).toBeUndefined();
  });

  it('always sends one name a court: blanks and missing tail entries take the default label', () => {
    expect(normalizeCourtNames({ numCourts: 3, manualCourtNames: [' Centre ', ''] }, court)).toEqual([
      'Centre',
      'Court 2',
      'Court 3',
    ]);
  });

  it('drops names beyond the court count and trims each to 40 characters', () => {
    const long = 'x'.repeat(50);
    expect(normalizeCourtNames({ numCourts: 1, manualCourtNames: [long, 'Extra'] }, court)).toEqual(['x'.repeat(40)]);
  });

  it('a registry venue never sends names', () => {
    expect(normalizeCourtNames({ numCourts: 1, venueId: 'v1', manualCourtNames: ['A'] }, court)).toBeUndefined();
  });
});
