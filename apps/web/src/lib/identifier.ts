import { isE164, isEmailShape } from '@padel/utils';

export type IdentifierKind = 'email' | 'phone';

export type ClassifiedIdentifier =
  | { ok: true; kind: IdentifierKind; value: string }
  | { ok: false; reason: 'phone' | 'email' };

/** The separators people type into a phone number, and nobody means as part of it. */
const PHONE_SEPARATORS = /[\s\-().]/g;

/**
 * Read one free-text field as an email or a phone number, the way web sign-in needs to.
 *
 * Mobile does not need this: it asks which one you mean with a toggle, and its phone field hands
 * back E.164. Web has a single field, and used to classify it with `isE164(value.trim())` — so
 * `+351 912 345 678`, the way anyone writes a Portuguese number, failed the check, was sent to the
 * EMAIL endpoint, and came back as GoTrue's "invalid format". The separators are stripped first now,
 * and the phone number is sent in the form the check accepted.
 *
 * A rejection says which kind it looked like, so the screen can say something useful: digits (with
 * or without a leading +) are a phone number in the wrong format; anything else is an address that
 * isn't one. Empty input falls in the second group, matching mobile's "Missing information".
 */
export function classifyIdentifier(raw: string): ClassifiedIdentifier {
  const trimmed = raw.trim();
  const compact = trimmed.replace(PHONE_SEPARATORS, '');
  if (isE164(compact)) return { ok: true, kind: 'phone', value: compact };
  if (/^\+?\d+$/.test(compact)) return { ok: false, reason: 'phone' };
  if (isEmailShape(trimmed)) return { ok: true, kind: 'email', value: trimmed };
  return { ok: false, reason: 'email' };
}

/** What to say about a rejection — mobile sign-in's two messages (sign-in.tsx). */
export const invalidIdentifierMessage = (reason: 'phone' | 'email') =>
  reason === 'phone'
    ? ({ ns: 'auth', key: 'invalid_phone' } as const)
    : ({ ns: 'common', key: 'missingInformation' } as const);
