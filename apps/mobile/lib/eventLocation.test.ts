import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Linking: { openURL: vi.fn() }, Platform: { OS: 'ios' } }));

import { eventPlace, mapsQuery, mapsUrl } from './eventLocation';

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

describe('mapsUrl', () => {
  const place = { name: 'Padel Club', address: 'Rua 1, Lisboa' };

  it('searches name and address together', () => {
    expect(mapsQuery(place)).toBe('Padel Club, Rua 1, Lisboa');
  });

  it('opens Apple Maps on iOS and a geo: intent elsewhere', () => {
    expect(mapsUrl(place, 'ios')).toBe('http://maps.apple.com/?q=Padel%20Club%2C%20Rua%201%2C%20Lisboa');
    expect(mapsUrl(place, 'android')).toBe('geo:0,0?q=Padel%20Club%2C%20Rua%201%2C%20Lisboa');
  });
});
