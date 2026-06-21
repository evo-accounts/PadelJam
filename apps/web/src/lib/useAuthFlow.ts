'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isE164, formatDisplayName } from '@padel/utils';
import {
  startEmailOtp,
  startPhoneOtp,
  verifyEmailOtp,
  verifyPhoneOtp,
  otpReducer,
  initialOtpState,
  MAX_ATTEMPTS,
  signInWithPassword,
} from '@padel/auth';
import type { TypedClient } from '@padel/db';
import { supabase } from '@/lib/supabase/client';

export type AuthStep = 'identifier' | 'otp' | 'createAccount' | 'done';
export type IdentifierKind = 'email' | 'phone';

export interface CompleteAccountInput {
  fullName: string;
  secondaryIdentifier: string;
  password: string;
}

const client = supabase as unknown as TypedClient;

const detectKind = (value: string): IdentifierKind => (isE164(value.trim()) ? 'phone' : 'email');

export function useAuthFlow() {
  const router = useRouter();

  const [step, setStep] = useState<AuthStep>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [kind, setKind] = useState<IdentifierKind>('email');
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

        const secondaryKind = detectKind(secondaryIdentifier.trim());
        const secondary =
          secondaryKind === 'phone'
            ? { phone: secondaryIdentifier.trim() }
            : { email: secondaryIdentifier.trim() };

        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        // The Edge Function attaches the secondary identifier + password AND creates the profiles
        // row server-side from the identifiers it persists on auth.users — never trust the client
        // to write its own identity into the globally-readable profiles table.
        const resp = await fetch(`${baseUrl}/functions/v1/complete-account`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ ...secondary, password, full_name: formatDisplayName(fullName) }),
        });

        if (!resp.ok) {
          setError(`complete-account-failed:${resp.status}`);
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

        setStep('done');
        router.push('/app');
      } finally {
        setBusy(false);
      }
    },
    [identifier, kind, router],
  );

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
    backToIdentifier,
  };
}
