/**
 * Everything `PhoneField` needs to know about countries and phone numbers, with
 * no React in sight so it can be tested directly (the `topBarLayout.ts` /
 * `sheetQueue.ts` pattern).
 *
 * METADATA CHOICE. Imports come from `libphonenumber-js/min`, the smallest of
 * the four metadata sets (84 KB of JSON against `max`'s 158 KB). `min` drops
 * per-TYPE information — it cannot tell a mobile from a landline — which this
 * app never asks for: sign-in only needs "is this a real number in this country"
 * and a national format to type into. Validation and `AsYouType` both work on it.
 *
 * Example numbers come from `examples.mobile.json`, a separate 4 KB asset with
 * one number for every one of the 245 supported countries. The alternative
 * considered was hand-writing examples for the seven countries that matter and
 * showing a generic mask elsewhere; 4 KB buys correct placeholders for the other
 * 238 instead, which is the better trade at that price.
 *
 * COUNTRY NAMES. libphonenumber ships none, so they come from `Intl.DisplayNames`
 * — which React Native's Hermes engine is not guaranteed to have. See
 * `displayNames` below: the guard must never throw, because this module builds
 * `COUNTRIES` at import time and a throw here would take the whole app down.
 */
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/min';
import type { CountryCode } from 'libphonenumber-js';
import examples from 'libphonenumber-js/examples.mobile.json';

export type Country = {
  code: CountryCode;
  /** With the leading '+', because that is how it is shown and searched for. */
  dialCode: string;
  name: string;
  flag: string;
};

/** Where `defaultRegion` lands when the device tells us nothing usable. */
const FALLBACK_REGION: CountryCode = 'PT';

/**
 * 🇵🇹 is not a glyph — it is 'P' and 'T' as REGIONAL INDICATOR SYMBOLS, which the
 * platform composes into a flag. 0x1f1e6 is the indicator for 'A', so each letter
 * is offset from 'A' (0x41) into that block.
 */
export const flagEmoji = (code: CountryCode): string =>
  [...code.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + (c.charCodeAt(0) - 0x41))).join('');

/**
 * `Intl.DisplayNames` is ES2020, but Hermes implements only a SUBSET of Intl and
 * this is not reliably in it — `apps/mobile/app.json` sets no `jsEngine`, so the
 * app runs on whatever Expo defaults to (Hermes) and there is no prebuilt
 * `ios/`/`android/` directory in which an Intl variant could have been pinned.
 *
 * Hence: feature-test, construct inside a try, and fall back to the ISO code. A
 * country list reading "PT / +351" is worse than "Portugal / +351" and better
 * than a blank screen.
 */
const displayNames: { of: (code: string) => string | undefined } | null = (() => {
  if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') return null;
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' });
  } catch {
    return null;
  }
})();

const countryName = (code: CountryCode): string => {
  if (!displayNames) return code;
  try {
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
};

/**
 * Every country libphonenumber knows, sorted by name.
 *
 * Built ONCE at module load: 245 entries, each of which calls into Intl and
 * composes two code points, and the sheet re-filters this list on every
 * keystroke of the search box.
 */
export const COUNTRIES: readonly Country[] = getCountries()
  .map((code) => ({
    code,
    dialCode: `+${getCountryCallingCode(code)}`,
    name: countryName(code),
    flag: flagEmoji(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const SUPPORTED = new Set<string>(getCountries());

/**
 * The region to start a fresh phone input in, from `expo-localization`'s
 * `getLocales()`. Takes only the shape it needs rather than the whole
 * `Locale` type, so a test can hand it a literal.
 *
 * First locale carrying a region libphonenumber supports wins; otherwise
 * {@link FALLBACK_REGION}. An unknown-but-present region (a stale ISO code, a
 * user-set oddity) must NOT be trusted through — `getCountryCallingCode` throws
 * on one, which at module scope would be fatal.
 */
export const defaultRegion = (locales: readonly { regionCode?: string | null }[]): CountryCode => {
  for (const l of locales) {
    const region = l.regionCode?.toUpperCase();
    if (region && SUPPORTED.has(region)) return region as CountryCode;
  }
  return FALLBACK_REGION;
};

/**
 * What to show in the empty input: a real, well-known-fake number for the
 * country, in the shape a local would write it — national prefix included, since
 * that is what they will type.
 */
export const placeholderFor = (code: CountryCode): string => {
  try {
    return getExampleNumber(code, examples)?.formatNational() ?? '';
  } catch {
    return '';
  }
};

/**
 * Format a partially typed national number. Non-digits in `digits` are dropped
 * first, so this is safe to call with the raw text out of a `TextInput`.
 */
export const formatNationalAsYouType = (digits: string, code: CountryCode): string =>
  new AsYouType(code).input(digits.replace(/\D/g, ''));

/**
 * The E.164 form ('+351912345678') of a national number, or null.
 *
 * Deliberately null for anything not VALID for the region, not merely
 * "possible": `PhoneField`'s contract is that `value` is either a complete
 * number or '', and a half-typed one must not look like a submittable value.
 */
export const toE164 = (national: string, code: CountryCode): string | null => {
  try {
    const parsed = parsePhoneNumberFromString(national, code);
    return parsed?.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
};

/**
 * Split an E.164 number back into a region and its national digits.
 *
 * `national` is the RAW national number — digits only, no national prefix and no
 * grouping — so `toE164(parseE164(x).national, region)` returns `x`. Call
 * {@link formatNationalAsYouType} on it to display it.
 */
export const parseE164 = (value: string): { region: CountryCode; national: string } | null => {
  try {
    const parsed = parsePhoneNumberFromString(value);
    if (!parsed?.country) return null;
    return { region: parsed.country, national: parsed.nationalNumber };
  } catch {
    return null;
  }
};

export const isValidFor = (national: string, code: CountryCode): boolean => {
  try {
    return isValidPhoneNumber(national, code);
  } catch {
    return false;
  }
};

/**
 * Lowercase and strip diacritics, so 'espana' finds 'España' and 'aland' finds
 * 'Åland'. `normalize` is feature-tested rather than assumed: it is another of
 * the string APIs a JS engine may ship without, and the search box degrading to
 * accent-SENSITIVE is survivable where a crash is not.
 */
const fold = (s: string): string => {
  const lower = s.toLowerCase();
  return typeof lower.normalize === 'function'
    ? lower.normalize('NFD').replace(/[̀-ͯ]/g, '')
    : lower;
};

/**
 * Filter the country list for the sheet's search box. Matches a name (folded), an
 * ISO code, or a dial code typed with or without its '+'.
 *
 * `list` is injectable so the tests do not depend on `Intl.DisplayNames` being
 * present — or on which language it answers in.
 */
export const searchCountries = (query: string, list: readonly Country[] = COUNTRIES): Country[] => {
  const q = fold(query).trim();
  if (!q) return [...list];
  // '+351' and '351' must both match, and a user pasting '+' alone should not
  // suddenly match every country.
  const digits = q.replace(/^\+/, '');
  return list.filter(
    (c) =>
      fold(c.name).includes(q)
      || c.code.toLowerCase().startsWith(q)
      || (digits.length > 0 && c.dialCode.slice(1).startsWith(digits)),
  );
};

/**
 * Present a server-masked phone number — '+351•••••5678' — as
 * '(+351) ••••• 5678', matching how a full number is grouped elsewhere.
 *
 * The dial code is the run of digits directly after the '+': everything the
 * server masked is non-digit, so the first non-digit character ends it. Anything
 * that does not have that shape is returned untouched rather than mangled.
 */
export const formatMaskedPhone = (masked: string): string => {
  const m = /^\+(\d+)(\D+)(\d*)$/.exec(masked.trim());
  if (!m) return masked;
  const [, dial = '', mask = '', tail = ''] = m;
  return `(+${dial}) ${mask}${tail ? ` ${tail}` : ''}`;
};

/**
 * Present a full E.164 number — '+351912345678' — as '(+351) 912 345 678', the
 * same grouping {@link formatMaskedPhone} gives a masked one, so the OTP
 * screen's help line and the "Try another way" rows read as one family.
 *
 * Used wherever a number is SHOWN BACK to the person who typed it. Raw E.164 is
 * the wire format, not a reading format: '+351912345678' is a dozen digits with
 * no grouping, and the audit flagged exactly that on the verification screen.
 *
 * Anything libphonenumber cannot place comes back untouched — a help line that
 * says '+351912345678' is worse than one that says '(+351) 912 345 678' and far
 * better than one that says nothing.
 */
export const formatE164ForDisplay = (value: string): string => {
  const parsed = parseE164(value);
  if (!parsed) return value;
  return `(+${getCountryCallingCode(parsed.region)}) ${formatNationalAsYouType(parsed.national, parsed.region)}`;
};
