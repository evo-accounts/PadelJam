import { isE164 } from '@padel/utils';

import type { AuthMethods } from './authMethods';

export type IdentifierKind = 'email' | 'phone';

/**
 * Guess the channel from the string alone.
 *
 * NOT used by sign-in any more, and deliberately so: that screen now has an
 * explicit phone/email mode and passes the channel it MEANS. This heuristic is
 * exactly what the audit's "phone flow does not work end to end" came down to —
 * a number typed without a '+' fails `isE164`, is called an email, and is sent
 * to the email OTP endpoint, which answers with an opaque 400.
 *
 * It stays for the callers that genuinely only have a string (create-account's
 * secondary identifier, the web flow's mirror of it).
 */
export const detectKind = (value: string): IdentifierKind =>
  isE164(value.trim()) ? 'phone' : 'email';

/**
 * Tiny module-level store carrying the OTP target (identifier + channel) across
 * the (auth) screens. Kept out of React state so it survives route transitions
 * without prop-drilling or serialising secrets through URL params.
 */
type AuthFlowState = {
  identifier: string;
  /** The channel the code was actually sent over. */
  kind: IdentifierKind;
  /**
   * Which INPUT the user was on when they started (UX-AUTH-02). Equal to `kind`
   * today, but it is a different question — "what was on screen" rather than
   * "what did we send" — and the OTP screen's third button is labelled from it.
   */
  entry: IdentifierKind;
  /**
   * The account's other sign-in methods, looked up in parallel with the send so
   * the "Try another way" sheet can open instantly (UX-AUTH-04). `null` means
   * not known — either the lookup has not landed yet or it failed, and the two
   * are deliberately indistinguishable: a failed lookup must never become an
   * account-existence oracle, and must never block a sign-in.
   */
  methods: AuthMethods | null;
};

const EMPTY: AuthFlowState = { identifier: '', kind: 'email', entry: 'email', methods: null };

let state: AuthFlowState = EMPTY;

export const setAuthTarget = (
  identifier: string,
  kind: IdentifierKind,
  entry: IdentifierKind = kind,
): void => {
  // A new target invalidates whatever the previous one's lookup found.
  state = { identifier, kind, entry, methods: null };
};

/**
 * Attach a lookup result to the target it was made for.
 *
 * The identifier is passed back rather than assumed: the lookup is fired
 * alongside the OTP send and resolves whenever it resolves, so by then the user
 * may have gone back and started a different sign-in. Writing a stale answer
 * onto the new target would offer the WRONG account's methods.
 */
export const setAuthMethods = (identifier: string, methods: AuthMethods | null): void => {
  if (identifier !== state.identifier) return;
  state = { ...state, methods };
};

export const getAuthTarget = (): AuthFlowState => state;

export const clearAuthTarget = (): void => {
  state = EMPTY;
};
