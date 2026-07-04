'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isE164, formatDisplayName } from '@padel/utils';
import {
  startEmailOtp,
  startPhoneOtp,
  verifyEmailOtp,
  verifyPhoneOtp,
  startEmailChange,
  startPhoneChange,
  verifyEmailChange,
  verifyPhoneChange,
  otpReducer,
  initialOtpState,
  MAX_ATTEMPTS,
  signInWithPassword,
} from '@padel/auth';
import type { TypedClient } from '@padel/db';
import { supabase } from '@/lib/supabase/client';

export type AuthStep = 'identifier' | 'otp' | 'createAccount' | 'verifySecondary' | 'done';
export type IdentifierKind = 'email' | 'phone';

export interface CompleteAccountInput {
  fullName: string;
  secondaryIdentifier: string;
  password: string;
}

const client = supabase as unknown as TypedClient;

const detectKind = (value: string): IdentifierKind => (isE164(value.trim()) ? 'phone' : 'email');

// Error codes the complete-account Edge Function returns that have user-facing
// copy in the web `auth` namespace (registered in i18n-web.ts). Exported so the
// step components use the same list when deciding whether flow.error is a key.
export const COMPLETE_ACCOUNT_ERROR_CODES = new Set([
  'email_taken',
  'phone_taken',
  'identifier_check_failed',
  'password_too_short',
  'invalid_phone',
  'full_name_required',
]);

export function useAuthFlow() {
  const router = useRouter();

  const [step, setStep] = useState<AuthStep>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [kind, setKind] = useState<IdentifierKind>('email');
  const [secondary, setSecondary] = useState('');
  const [secondaryKind, setSecondaryKind] = useState<IdentifierKind>('phone');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otpState, dispatch] = useReducer(otpReducer, undefined, initialOtpState);

  // The reducer stays pure; the hook supplies the clock via a ticking state (Date.now() lives in
  // an effect, never in render — keeps the component render pure for React 19).
  const [now, setNow] = useState(0);
  useEffect(() => {
    // Date.now() lives in the interval callback (never in render). cooldownUntil starts at 0 on
    // mount, so the initial now=0 window is harmless; the tick begins updating immediately.
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const cooldownRemainingMs = Math.max(0, otpState.cooldownUntil - now);

  const sendOtp = useCallback(async () => {
    const value = identifier.trim();
    if (!value) return;
    const k = detectKind(value);
    setKind(k);
    setBusy(true);
    setError(null);
    try {
      const { error: otpError } =
        k === 'phone' ? await startPhoneOtp(client, value) : await startEmailOtp(client, value);
      if (otpError) {
        setError(otpError.message);
        return;
      }
      dispatch({ type: 'sent', at: Date.now() });
      setStep('otp');
    } finally {
      setBusy(false);
    }
  }, [identifier]);

  const resendOtp = useCallback(async () => {
    if (otpState.cooldownUntil - Date.now() > 0) return;
    const value = identifier.trim();
    setBusy(true);
    setError(null);
    try {
      const { error: otpError } =
        kind === 'phone' ? await startPhoneOtp(client, value) : await startEmailOtp(client, value);
      if (otpError) {
        setError(otpError.message);
        return;
      }
      dispatch({ type: 'sent', at: Date.now() });
    } finally {
      setBusy(false);
    }
  }, [identifier, kind, otpState.cooldownUntil]);

  const verify = useCallback(
    async (code: string) => {
      if (otpState.locked) return;
      const value = identifier.trim();
      setBusy(true);
      setError(null);
      try {
        const { data, error: verifyError } =
          kind === 'phone'
            ? await verifyPhoneOtp(client, value, code)
            : await verifyEmailOtp(client, value, code);

        if (verifyError || !data.user) {
          dispatch({ type: 'fail' });
          setError(verifyError?.message ?? 'invalid');
          return;
        }

        const { data: profile } = await client
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile) {
          setStep('done');
          router.push('/app');
        } else {
          setStep('createAccount');
        }
      } finally {
        setBusy(false);
      }
    },
    [identifier, kind, otpState.locked, router],
  );

  // GoTrue rejects a change to an identifier already registered on auth.users (the profiles
  // pre-check in complete-account can't see auth-only users) — reuse the "taken" copy for those.
  const startChangeErrorKey = (err: { code?: string } | null): string => {
    if (err?.code === 'email_exists') return 'email_taken';
    if (err?.code === 'phone_exists') return 'phone_taken';
    return 'sendCodeFailed';
  };

  const startSecondaryChange = useCallback(
    async (value: string, k: IdentifierKind): Promise<'sent' | 'applied' | 'failed'> => {
      const { data, error: changeErr } =
        k === 'phone' ? await startPhoneChange(client, value) : await startEmailChange(client, value);
      if (changeErr) {
        // Clear any attempts/cooldown carried over from the primary OTP step so the failed send
        // doesn't start the verify step locked or on cooldown.
        dispatch({ type: 'reset' });
        setError(startChangeErrorKey(changeErr));
        return 'failed';
      }
      // If the server has confirmations disabled, GoTrue applies the change immediately (the
      // returned user already carries the new identifier — phone in GoTrue format, no '+').
      // There is no code in flight, so showing the verify step would dead-end.
      const applied =
        k === 'phone'
          ? data.user?.phone === value.replace(/^\+/, '')
          : data.user?.email?.toLowerCase() === value.toLowerCase();
      if (applied) return 'applied';
      dispatch({ type: 'sent', at: Date.now() });
      return 'sent';
    },
    [],
  );

  const completeAccount = useCallback(
    async ({ fullName, secondaryIdentifier, password }: CompleteAccountInput) => {
      setBusy(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (!session) {
          setError('no-session');
          return;
        }

        const secondaryValue = secondaryIdentifier.trim();
        const secKind = detectKind(secondaryValue);
        const secondaryBody =
          secKind === 'phone' ? { phone: secondaryValue } : { email: secondaryValue };

        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        // The Edge Function sets the password AND creates the profiles row server-side from the
        // identifiers it persists on auth.users — never trust the client to write its own identity
        // into the globally-readable profiles table. The secondary identifier goes along only for
        // the fast already-taken pre-check; it is attached below via the VERIFIED change flow.
        const resp = await fetch(`${baseUrl}/functions/v1/complete-account`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ ...secondaryBody, password, full_name: formatDisplayName(fullName) }),
        });

        if (!resp.ok) {
          let code: string | undefined;
          try {
            code = ((await resp.json()) as { error?: string }).error;
          } catch {
            // Non-JSON error body — fall through to the generic failure code below.
          }
          // Store the i18n KEY; the step components translate at render (their convention).
          if (code && COMPLETE_ACCOUNT_ERROR_CODES.has(code)) {
            setError(code);
          } else {
            setError(`complete-account-failed:${resp.status}${code ? `:${code}` : ''}`);
          }
          return;
        }

        // complete-account sets a password via the admin API, which rotates the OTP-issued refresh
        // token; re-establish a fresh session with the password we just set before entering the app.
        const { error: signInErr } = await signInWithPassword(client, identifier.trim(), kind, password);
        if (signInErr) {
          setError('session-refresh-failed');
          setStep('identifier');
          return;
        }

        // Verify the secondary identifier as the signed-in user: updateUser sends the OTP, the
        // verifySecondary step collects it. Enter the step even when the send fails — the account
        // already exists, so the user retries (resend) or skips instead of resubmitting the form.
        setSecondary(secondaryValue);
        setSecondaryKind(secKind);
        if ((await startSecondaryChange(secondaryValue, secKind)) === 'applied') {
          setStep('done');
          router.push('/app');
          return;
        }
        setStep('verifySecondary');
      } finally {
        setBusy(false);
      }
    },
    [identifier, kind, startSecondaryChange],
  );

  const verifySecondary = useCallback(
    async (code: string) => {
      if (otpState.locked) return;
      setBusy(true);
      setError(null);
      try {
        const { error: verifyError } =
          secondaryKind === 'phone'
            ? await verifyPhoneChange(client, secondary, code)
            : await verifyEmailChange(client, secondary, code);
        if (verifyError) {
          dispatch({ type: 'fail' });
          setError(verifyError.message);
          return;
        }
        setStep('done');
        router.push('/app');
      } finally {
        setBusy(false);
      }
    },
    [secondary, secondaryKind, otpState.locked, router],
  );

  const resendSecondary = useCallback(async () => {
    if (otpState.cooldownUntil - Date.now() > 0) return;
    setBusy(true);
    setError(null);
    try {
      if ((await startSecondaryChange(secondary, secondaryKind)) === 'applied') {
        setStep('done');
        router.push('/app');
      }
    } finally {
      setBusy(false);
    }
  }, [secondary, secondaryKind, otpState.cooldownUntil, startSecondaryChange, router]);

  // The secondary is optional (profiles.email/phone are nullable): skipping leaves the profile
  // with just the verified primary; the user can add the other identifier later in settings.
  const skipSecondary = useCallback(() => {
    setStep('done');
    router.push('/app');
  }, [router]);

  const backToIdentifier = useCallback(() => {
    dispatch({ type: 'reset' });
    setError(null);
    setStep('identifier');
  }, []);

  return {
    step,
    identifier,
    setIdentifier,
    kind,
    secondary,
    secondaryKind,
    error,
    busy,
    locked: otpState.locked,
    attempts: otpState.attempts,
    maxAttempts: MAX_ATTEMPTS,
    cooldownRemainingMs,
    sendOtp,
    resendOtp,
    verify,
    completeAccount,
    verifySecondary,
    resendSecondary,
    skipSecondary,
    backToIdentifier,
  };
}
