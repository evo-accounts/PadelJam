import { describe, expect, it } from 'vitest';

import { eventPlace, mapsQuery, mapsWebUrl } from './eventLocation';

const none = { has_location: false, venue: null, manual_location_name: null, manual_location_address: null };

describe('eventPlace', () => {
  it('prefers the registry venue', () => {
    expect(
      eventPlace({ ...none, has_location: true, venue: { name: 'Club', address: 'Rua 1' }, manual_location_name: 'X' }),
    ).toEqual({ name: 'Club', address: 'Rua 1' });
  });

  it('falls back to the manual location', () => {
    expect(eventPlace({ ...none, has_location: true, manual_location_name: 'Court', manual_location_address: 'Av 2' })).toEqual({
      name: 'Court',
      address: 'Av 2',
    });
  });

  it('uses the address as the name when a manual location has no name', () => {
    expect(eventPlace({ ...none, has_location: true, manual_location_address: 'Av 2' })).toEqual({
      name: 'Av 2',
      address: null,
    });
  });

  it('is null for an event without a location', () => {
    expect(eventPlace(none)).toBeNull();
    expect(eventPlace({ ...none, has_location: true })).toBeNull();
  });
});

describe('mapsQuery', () => {
  it('searches name and address together', () => {
    expect(mapsQuery({ name: 'Padel Club', address: 'Rua 1, Lisboa' })).toBe('Padel Club, Rua 1, Lisboa');
  });

  it('is just the name when there is no address', () => {
    expect(mapsQuery({ name: 'Padel Club', address: null })).toBe('Padel Club');
  });
});

describe('mapsWebUrl', () => {
  const place = { name: 'Padel Club', address: 'Rua 1, Lisboa' };

  it('opens Apple Maps on Apple devices', () => {
    expect(mapsWebUrl(place, true)).toBe('https://maps.apple.com/?q=Padel%20Club%2C%20Rua%201%2C%20Lisboa');
  });

  it('opens a Google Maps search elsewhere', () => {
    expect(mapsWebUrl(place, false)).toBe(
      'https://www.google.com/maps/search/?api=1&query=Padel%20Club%2C%20Rua%201%2C%20Lisboa',
    );
  });
});
