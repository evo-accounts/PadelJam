import { describe, expect, it } from 'vitest';
import { isEmailShape } from './identifier';

describe('isEmailShape', () => {
  it('accepts ordinary and unusual real addresses', () => {
    expect(isEmailShape('player@example.com')).toBe(true);
    expect(isEmailShape('first.last+padel@clube.pt')).toBe(true);
    expect(isEmailShape('a@b.photography')).toBe(true);
  });
  it('rejects what cannot be an address', () => {
    expect(isEmailShape('')).toBe(false);
    expect(isEmailShape('not-an-email')).toBe(false);
    expect(isEmailShape('player@example')).toBe(false);
    expect(isEmailShape('player @example.com')).toBe(false);
    expect(isEmailShape('+351912345678')).toBe(false);
  });
});
