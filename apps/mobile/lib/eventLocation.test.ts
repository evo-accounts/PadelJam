import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Linking: { openURL: vi.fn() }, Platform: { OS: 'ios' } }));

import { mapsUrl } from './eventLocation';

describe('mapsUrl', () => {
  const place = { name: 'Padel Club', address: 'Rua 1, Lisboa' };

  it('opens Apple Maps on iOS and a geo: intent elsewhere', () => {
    expect(mapsUrl(place, 'ios')).toBe('http://maps.apple.com/?q=Padel%20Club%2C%20Rua%201%2C%20Lisboa');
    expect(mapsUrl(place, 'android')).toBe('geo:0,0?q=Padel%20Club%2C%20Rua%201%2C%20Lisboa');
  });
});
