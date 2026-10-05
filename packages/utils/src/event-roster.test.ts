import { describe, expect, it } from 'vitest';

import { guestBlocker, rosterOverflows, rosterRoom, type RosterInput } from './event-roster';

const base: RosterInput = {
  numCourts: 2,
  specification: 'classic',
  allowStandby: false,
  standbySpots: undefined,
  organizerPlays: true,
  organizerGender: 'male',
  guests: [],
};

describe('rosterRoom', () => {
  it('is four a court, less the playing organizer and every guest', () => {
    expect(rosterRoom(base)).toEqual({ capacity: 8, remaining: 7, perGender: null });
    expect(rosterRoom({ ...base, guests: [{}, {}] }).remaining).toBe(5);
  });

  it('an organizer who only organizes takes no spot', () => {
    expect(rosterRoom({ ...base, organizerPlays: false }).remaining).toBe(8);
  });

  it('adds stand-by spots only while stand-by is allowed', () => {
    expect(rosterRoom({ ...base, allowStandby: true, standbySpots: 4 }).capacity).toBe(12);
    expect(rosterRoom({ ...base, allowStandby: false, standbySpots: 4 }).capacity).toBe(8);
  });

  it('splits a mixed event per gender, rounding down like the server', () => {
    const room = rosterRoom({
      ...base,
      specification: 'mixed',
      allowStandby: true,
      standbySpots: 3, // 11 spots → 5 per gender
      guests: [{ gender: 'female' }, { gender: 'female' }],
    });
    expect(room.capacity).toBe(11);
    expect(room.perGender).toEqual({ male: 4, female: 3 });
    expect(room.remaining).toBe(8);
  });

  it('an organizer without a gender counts toward the total only', () => {
    const room = rosterRoom({ ...base, specification: 'mixed', organizerGender: null });
    expect(room.perGender).toEqual({ male: 4, female: 4 });
    expect(room.remaining).toBe(7);
  });
});

describe('guestBlocker', () => {
  it('lets a guest in while there is room', () => {
    expect(guestBlocker(rosterRoom(base))).toBeNull();
  });

  it('refuses one more guest on a full event', () => {
    const full = rosterRoom({ ...base, numCourts: 1, guests: [{}, {}, {}] });
    expect(full.remaining).toBe(0);
    expect(guestBlocker(full)).toBe('event_full');
  });

  it('refuses a gender whose half is full, but not the other', () => {
    const room = rosterRoom({
      ...base,
      numCourts: 1,
      specification: 'mixed',
      guests: [{ gender: 'male' }],
    });
    expect(guestBlocker(room, 'male')).toBe('gender_full');
    expect(guestBlocker(room, 'female')).toBeNull();
  });
});

describe('rosterOverflows', () => {
  it('flags a roster that no longer fits after the court count went down', () => {
    expect(rosterOverflows(rosterRoom({ ...base, numCourts: 1, guests: [{}, {}, {}] }))).toBe(false);
    expect(rosterOverflows(rosterRoom({ ...base, numCourts: 1, guests: [{}, {}, {}, {}] }))).toBe(true);
  });

  it('flags one gender over its half even when the total fits', () => {
    const room = rosterRoom({
      ...base,
      numCourts: 1,
      specification: 'mixed',
      organizerPlays: false,
      guests: [{ gender: 'female' }, { gender: 'female' }, { gender: 'female' }],
    });
    expect(room.remaining).toBe(1);
    expect(rosterOverflows(room)).toBe(true);
  });
});
