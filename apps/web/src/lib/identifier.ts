import { isEmailShape } from '@padel/utils';

export type IdentifierKind = 'email' | 'phone';

export type ClassifiedIdentifier =
  | { ok: true; kind: IdentifierKind; value: string }
  | { ok: false; reason: 'phone' | 'email' };

/**
 * Read the sign-in field. Phone sign-in is hidden for launch (PAD-137), so only an email is
 * accepted: a phone number is rejected like any other non-email, with the "missing information"
 * message and nothing sent. Turning phone back on means reverting that change (the phone branch,
 * which stripped separators and checked `isE164`, is in git history).
 */
export function classifyIdentifier(raw: string): ClassifiedIdentifier {
  const trimmed = raw.trim();
  if (isEmailShape(trimmed)) return { ok: true, kind: 'email', value: trimmed };
  return { ok: false, reason: 'email' };
}

/** What to say about a rejection — mobile sign-in's two messages (sign-in.tsx). */
export const invalidIdentifierMessage = (reason: 'phone' | 'email') =>
  reason === 'phone'
    ? ({ ns: 'auth', key: 'invalid_phone' } as const)
    : ({ ns: 'common', key: 'missingInformation' } as const);
