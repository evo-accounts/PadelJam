import type { TypedClient } from '@padel/db';

export type OtpState = { attempts: number; locked: boolean; cooldownUntil: number };
export type OtpAction = { type: 'sent'; at: number } | { type: 'fail' } | { type: 'reset' };

export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 30_000;

export const initialOtpState = (): OtpState => ({ attempts: 0, locked: false, cooldownUntil: 0 });

export function otpReducer(state: OtpState, action: OtpAction): OtpState {
  switch (action.type) {
    case 'sent':
      return { attempts: 0, locked: false, cooldownUntil: action.at + RESEND_COOLDOWN_MS };
    case 'fail': {
      const attempts = state.attempts + 1;
      return { ...state, attempts, locked: attempts >= MAX_ATTEMPTS };
    }
    case 'reset':
      return initialOtpState();
  }
}

// Thin Supabase wrappers — kept minimal so the reducer above stays the tested unit.
export const startEmailOtp = (c: TypedClient, email: string) => c.auth.signInWithOtp({ email });
export const startPhoneOtp = (c: TypedClient, phone: string) => c.auth.signInWithOtp({ phone });
export const verifyEmailOtp = (c: TypedClient, email: string, token: string) =>
  c.auth.verifyOtp({ email, token, type: 'email' });
export const verifyPhoneOtp = (c: TypedClient, phone: string, token: string) =>
  c.auth.verifyOtp({ phone, token, type: 'sms' });

export const startEmailChange = (c: TypedClient, newEmail: string) => c.auth.updateUser({ email: newEmail });
export const verifyEmailChange = (c: TypedClient, newEmail: string, token: string) =>
  c.auth.verifyOtp({ email: newEmail, token, type: 'email_change' });
