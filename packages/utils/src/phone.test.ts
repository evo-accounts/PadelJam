import { describe, it, expect } from 'vitest';
import { isE164, formatDisplayName } from './index';

describe('isE164', () => {
  it('accepts a valid E.164 number', () => expect(isE164('+351912345678')).toBe(true));
  it('rejects a number without country code', () => expect(isE164('912345678')).toBe(false));
  it('rejects gibberish', () => expect(isE164('abc')).toBe(false));
});

describe('formatDisplayName', () => {
  it('trims and collapses whitespace', () => expect(formatDisplayName('  Ana   Silva ')).toBe('Ana Silva'));
});
