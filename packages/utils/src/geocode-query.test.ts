import { describe, it, expect } from 'vitest';
import { geocodeQuery } from './geocode-query';

describe('geocodeQuery', () => {
  it('joins name and address', () => {
    expect(geocodeQuery({ name: 'Padel Palace', address: '1 Court St' })).toBe('Padel Palace, 1 Court St');
  });
  it('uses name alone when address is missing', () => {
    expect(geocodeQuery({ name: 'Padel Palace' })).toBe('Padel Palace');
  });
  it('trims and skips blanks', () => {
    expect(geocodeQuery({ name: '  ', address: ' 9 Court Ave ' })).toBe('9 Court Ave');
  });
  it('returns null when nothing usable', () => {
    expect(geocodeQuery({})).toBeNull();
    expect(geocodeQuery({ name: '', address: '   ' })).toBeNull();
  });
});
