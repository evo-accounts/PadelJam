import type { EventDetail } from '@padel/api';
import { updateEventSchema } from '@padel/api';
import { describe, expect, it } from 'vitest';

import {
  courtsBelowRoster,
  courtsOrLocationChanged,
  draftFromEvent,
  locationChanged,
  locationModeOf,
  locationOverrides,
  updateValues,
} from './eventDraft';

const base = {
  id: 'e1',
  group_id: 'g1',
  event_type: 'americano',
  specification: 'classic',
  scoring_mode: 'points',
  scoring_value: 32,
  venue_id: null,
  venue: null,
  has_location: true,
  manual_location_name: 'Club',
  manual_location_address: 'Rua 1',
  num_courts: 2,
  starts_at: '2026-10-10T18:00:00.000Z',
  duration_minutes: 90,
  allow_standby: true,
  standby_spots: 2,
  is_private: false,
  entrance_fee_enabled: true,
  entrance_fee_amount: 5,
  entrance_fee_method: 'cash',
  entrance_fee_mba_number: null,
  players_submit_results: false,
  organizer_role: 'organizing_and_playing',
  name: 'Tuesday Americano',
  description: null,
  thumbnail_path: 'u/t.jpg',
  manual_court_names: null,
} as unknown as EventDetail;

describe('draftFromEvent / updateValues', () => {
  it('round-trips every stored field, so a sheet never blanks another', () => {
    const parsed = updateEventSchema.parse(updateValues(draftFromEvent(base)));
    expect(parsed).toMatchObject({
      name: 'Tuesday Americano',
      thumbnailPath: 'u/t.jpg',
      startsAt: '2026-10-10T18:00:00.000Z',
      durationMinutes: 90,
      scoringMode: 'points',
      scoringValue: 32,
      allowStandby: true,
      standbySpots: 2,
      isPrivate: false,
      entranceFee: { enabled: true, amount: 5, method: 'cash' },
      organizerRole: 'organizing_and_playing',
      numCourts: 2,
      hasLocation: true,
      manualLocationName: 'Club',
      manualLocationAddress: 'Rua 1',
    });
    expect(parsed.description).toBeUndefined();
    expect(parsed.locationLat).toBeUndefined();
  });

  it('normalises the stored +00:00 offset to the Z form the schema accepts', () => {
    const e = { ...base, starts_at: '2026-10-06T18:00:00+00:00' } as unknown as EventDetail;
    const v = updateEventSchema.parse(updateValues(draftFromEvent(e)));
    expect(v.startsAt).toBe('2026-10-06T18:00:00.000Z');
  });

  it('carries a registry venue as its id, with the manual columns cleared by the builder', () => {
    const e = { ...base, venue_id: '00000000-0000-4000-8000-000000000001', venue: { name: 'Padel Club', address: 'Av 2' } } as unknown as EventDetail;
    const d = draftFromEvent(e);
    expect(d.locationMode).toBe('registry');
    expect(d.manualLocationName).toBe('Padel Club');
    expect(locationChanged(d, e)).toBe(false);
  });

  it('drops a switched-off fee and stand-by, and classic scoring value', () => {
    const d = { ...draftFromEvent(base), allowStandby: false, entranceFee: { ...draftFromEvent(base).entranceFee, enabled: false }, scoringMode: 'classic' as const };
    const v = updateEventSchema.parse(updateValues(d));
    expect(v.standbySpots).toBeUndefined();
    expect(v.entranceFee).toEqual({ enabled: false });
    expect(v.scoringValue).toBeNull();
  });

  it('uses the uploaded thumbnail and a new point when given', () => {
    const v = updateValues(draftFromEvent(base), { thumbnailPath: 'u/new.jpg', coords: { lat: 1, lng: 2 } });
    expect(v).toMatchObject({ thumbnailPath: 'u/new.jpg', locationLat: 1, locationLng: 2 });
  });
});

describe('locationModeOf / locationChanged', () => {
  it('reads the three answers', () => {
    expect(locationModeOf({ venue_id: 'v', has_location: true })).toBe('registry');
    expect(locationModeOf({ venue_id: null, has_location: true })).toBe('manual');
    expect(locationModeOf({ venue_id: null, has_location: false })).toBe('none');
  });

  it('flags a new address but not an untouched draft', () => {
    const d = draftFromEvent(base);
    expect(locationChanged(d, base)).toBe(false);
    expect(locationChanged({ ...d, manualLocationAddress: 'Rua 2' }, base)).toBe(true);
    expect(locationChanged({ ...d, hasLocation: false }, base)).toBe(true);
  });
});

describe('courts (0122)', () => {
  const venueEvent = { ...base, venue_id: '00000000-0000-4000-8000-000000000001', venue: { name: 'Padel Club', address: 'Av 2' } } as unknown as EventDetail;
  const court = '00000000-0000-4000-8000-0000000000c1';
  const name = (n: number) => `Court ${n}`;

  it('sends courts only from the Location sheet', () => {
    const d = draftFromEvent(venueEvent, [court]);
    expect(d.courtIds).toEqual([court]);
    expect(updateValues(d).courtIds).toBeUndefined();
    const v = updateEventSchema.parse(updateValues(d, { courts: { courtName: name } }));
    expect(v).toMatchObject({ courtIds: [court], courtsReserved: true });
  });

  it('no ticked court at a venue is "not reserved yet"', () => {
    const v = updateValues(draftFromEvent(venueEvent), { courts: { courtName: name } });
    expect(v).toMatchObject({ courtIds: [], courtsReserved: false });
  });

  it('a manual venue sends its court names, blanks named', () => {
    const d = { ...draftFromEvent(base), manualCourtNames: ['Centre', ''] };
    const v = updateEventSchema.parse(updateValues(d, { courts: { courtName: name } }));
    expect(v.manualCourtNames).toEqual(['Centre', 'Court 2']);
  });

  it('duplicate overrides carry the whole location, only when changed', () => {
    const d = draftFromEvent(base);
    expect(courtsOrLocationChanged(d, base)).toBe(false);
    const moved = { ...d, numCourts: 3 };
    expect(courtsOrLocationChanged(moved, base)).toBe(true);
    expect(locationOverrides(moved, { lat: 1, lng: 2 }, name)).toMatchObject({
      venue_id: null,
      manual_location_name: 'Club',
      manual_location_address: 'Rua 1',
      has_location: true,
      num_courts: 3,
      location_lat: 1,
      location_lng: 2,
    });
    expect(locationOverrides({ ...draftFromEvent(venueEvent, [court]) }, null, name)).toMatchObject({
      venue_id: '00000000-0000-4000-8000-000000000001',
      court_ids: [court],
      courts_reserved: true,
    });
  });
});

describe('courtsBelowRoster', () => {
  it('refuses fewer spots than confirmed players', () => {
    expect(courtsBelowRoster(1, 5)).toBe(true);
    expect(courtsBelowRoster(2, 8)).toBe(false);
  });
});
