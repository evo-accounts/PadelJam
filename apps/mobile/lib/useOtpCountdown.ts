import { initialOtpState, otpReducer, type OtpAction, type OtpState } from '@padel/auth';
import { useCallback, useEffect, useReducer, useState } from 'react';

/**
 * Whole seconds left on a resend cooldown, floored at zero.
 *
 * `ceil`, not `round`: at 29.4s remaining the button must still say 30, because
 * a countdown that skips a number looks broken and one that reaches 0 while the
 * resend is still refused looks worse.
 */
export const otpRemaining = (cooldownUntil: number, now: number): number =>
  Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

/**
 * The OTP resend cooldown, as one hook.
 *
 * `otp.tsx`, `create-account.tsx` and `recovery.tsx` each carried the same
 * fifteen lines: a `useReducer(otpReducer)`, a `useState(Date.now())`, a
 * one-second `setInterval` that exists only to re-render, and the `ceil`
 * above. Three copies of a timer is three chances to leak one.
 *
 * The interval runs ONLY while a cooldown is actually pending — a screen
 * sitting on a verified code does not tick once a second forever.
 *
 * `dispatch` is wrapped rather than returned raw so that a `sent` action also
 * resamples the clock. Without it the first render after a resend computes the
 * remaining seconds against a `now` from up to a second ago and shows 31.
 */
export function useOtpCountdown(): {
  state: OtpState;
  dispatch: (action: OtpAction) => void;
  remaining: number;
} {
  const [state, rawDispatch] = useReducer(otpReducer, undefined, initialOtpState);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.cooldownUntil <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.cooldownUntil, now]);

  const dispatch = useCallback((action: OtpAction) => {
    if (action.type === 'sent') setNow(Date.now());
    rawDispatch(action);
  }, []);

  return { state, dispatch, remaining: otpRemaining(state.cooldownUntil, now) };
}
