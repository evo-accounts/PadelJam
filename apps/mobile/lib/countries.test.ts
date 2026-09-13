import { describe, expect, it } from 'vitest';

import {
  COUNTRIES,
  defaultRegion,
  flagEmoji,
  formatMaskedPhone,
  formatNationalAsYouType,
  isValidFor,
  parseE164,
  placeholderFor,
  searchCountries,
  toE164,
  type Country,
} from './countries';

/**
 * Names come from `Intl.DisplayNames` in whatever locale the engine defaults to,
 * so asserting on real ones would make these tests depend on the machine. The
 * name-matching cases run against this fixture instead — which is also why
 * `searchCountries` takes the list as an argument.
 */
const FIXTURE: Country[] = [
  { code: 'ES', dialCode: '+34', name: 'España', flag: '🇪🇸' },
  { code: 'PT', dialCode: '+351', name: 'Portugal', flag: '🇵🇹' },
  { code: 'BR', dialCode: '+55', name: 'Brasil', flag: '🇧🇷' },
  { code: 'US', dialCode: '+1', name: 'United States', flag: '🇺🇸' },
];

const codes = (list: Country[]) => list.map((c) => c.code);

describe('flagEmoji', () => {
  it('composes regional indicators', () => {
    expect(flagEmoji('PT')).toBe('🇵🇹');
    expect(flagEmoji('BR')).toBe('🇧🇷');
    expect(flagEmoji('US')).toBe('🇺🇸');
  });
  it('is two code points, not a glyph', () => {
    expect([...flagEmoji('PT')]).toHaveLength(2);
  });
});

describe('COUNTRIES', () => {
  it('covers every country libphonenumber knows, each with a dial code and a flag', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    const pt = COUNTRIES.find((c) => c.code === 'PT');
    expect(pt?.dialCode).toBe('+351');
    expect(pt?.flag).toBe('🇵🇹');
    expect(COUNTRIES.every((c) => c.name.length > 0)).toBe(true);
  });
  it('is sorted by name', () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('defaultRegion', () => {
  it('takes the device region', () => {
    expect(defaultRegion([{ regionCode: 'BR' }])).toBe('BR');
  });
  it('uppercases a lowercase region and skips entries without one', () => {
    expect(defaultRegion([{ regionCode: null }, { regionCode: 'gb' }])).toBe('GB');
  });
  it('falls back to PT when the region is null', () => {
    expect(defaultRegion([{ regionCode: null }])).toBe('PT');
  });
  it('falls back to PT for a region libphonenumber does not know', () => {
    // Not merely unhelpful: `getCountryCallingCode('ZZ')` THROWS, and this
    // module's result reaches a module-scope country list.
    expect(defaultRegion([{ regionCode: 'ZZ' }])).toBe('PT');
  });
  it('falls back to PT when the device reports no locales at all', () => {
    expect(defaultRegion([])).toBe('PT');
  });
});

describe('toE164 / parseE164', () => {
  it.each([
    ['PT', '912345678', '+351912345678'],
    ['BR', '11961234567', '+5511961234567'],
    ['US', '2015550123', '+12015550123'],
  ] as const)('round-trips %s', (region, national, e164) => {
    expect(toE164(national, region)).toBe(e164);
    expect(parseE164(e164)).toEqual({ region, national });
  });

  it('is null while the number is still incomplete', () => {
    expect(toE164('912', 'PT')).toBeNull();
    expect(toE164('', 'PT')).toBeNull();
  });

  it('accepts the national prefix a local would type', () => {
    expect(toE164('0612345678', 'FR')).toBe('+33612345678');
  });

  it('returns null for anything that is not an E.164 number', () => {
    expect(parseE164('912345678')).toBeNull();
    expect(parseE164('')).toBeNull();
    expect(parseE164('not a number')).toBeNull();
  });
});

describe('isValidFor', () => {
  it('accepts a complete number and rejects a partial one', () => {
    expect(isValidFor('912345678', 'PT')).toBe(true);
    expect(isValidFor('91234', 'PT')).toBe(false);
  });
});

describe('placeholderFor / formatNationalAsYouType', () => {
  it('shows a real example in the national shape', () => {
    expect(placeholderFor('PT')).toBe('912 345 678');
    expect(placeholderFor('US')).toBe('(201) 555-0123');
  });
  it('formats as the user types, and ignores what they paste around the digits', () => {
    expect(formatNationalAsYouType('9123', 'PT')).toBe('912 3');
    expect(formatNationalAsYouType('912345678', 'PT')).toBe('912 345 678');
    expect(formatNationalAsYouType('(912) 345-678', 'PT')).toBe('912 345 678');
    expect(formatNationalAsYouType('', 'PT')).toBe('');
  });
});

describe('searchCountries', () => {
  it('matches by name', () => {
    expect(codes(searchCountries('portu', FIXTURE))).toEqual(['PT']);
  });
  it('matches by dial code, with and without the leading +', () => {
    expect(codes(searchCountries('351', FIXTURE))).toEqual(['PT']);
    expect(codes(searchCountries('+351', FIXTURE))).toEqual(['PT']);
  });
  it('matches by ISO code', () => {
    // 'united states' does not contain 'us', so this can only have matched the code.
    expect(codes(searchCountries('us', FIXTURE))).toEqual(['US']);
  });
  it('is accent-insensitive both ways', () => {
    expect(codes(searchCountries('espana', FIXTURE))).toEqual(['ES']);
    expect(codes(searchCountries('ESPAÑA', FIXTURE))).toEqual(['ES']);
    expect(codes(searchCountries('brasil', FIXTURE))).toEqual(['BR']);
  });
  it('returns everything for an empty or whitespace query', () => {
    expect(codes(searchCountries('', FIXTURE))).toEqual(['ES', 'PT', 'BR', 'US']);
    expect(codes(searchCountries('   ', FIXTURE))).toEqual(['ES', 'PT', 'BR', 'US']);
  });
  it('returns nothing when nothing matches', () => {
    expect(searchCountries('zzzz', FIXTURE)).toEqual([]);
  });
  it('defaults to the real country list', () => {
    expect(codes(searchCountries('+351'))).toEqual(['PT']);
  });
});

describe('formatMaskedPhone', () => {
  it('groups a server-masked number', () => {
    expect(formatMaskedPhone('+351•••••5678')).toBe('(+351) ••••• 5678');
    expect(formatMaskedPhone('+1•••••1234')).toBe('(+1) ••••• 1234');
  });
  it('handles a mask with no visible tail', () => {
    expect(formatMaskedPhone('+351•••••')).toBe('(+351) •••••');
  });
  it('leaves anything that is not masked alone', () => {
    expect(formatMaskedPhone('+351912345678')).toBe('+351912345678');
    expect(formatMaskedPhone('nome@exemplo.com')).toBe('nome@exemplo.com');
    expect(formatMaskedPhone('')).toBe('');
  });
});
