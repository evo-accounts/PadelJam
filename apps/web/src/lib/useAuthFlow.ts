'use client';

import { useCallback, useMemo, useReducer, useState } from 'react';
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

  // The reducer stays pure; the hook supplies the clock.
  const cooldownRemainingMs = useMemo(
    () => Math.max(0, otpState.cooldownUntil - Date.now()),
    [otpState.cooldownUntil],
  );

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
        const resp = await fetch(`${baseUrl}/functions/v1/complete-account`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ ...secondary, password }),
        });

        if (!resp.ok) {
          setError(`complete-account-failed:${resp.status}`);
          return;
        }

        const primary = kind === 'phone' ? { phone: identifier.trim() } : { email: identifier.trim() };
        const email = (primary.email ?? secondary.email) as string;
        const phone = (primary.phone ?? secondary.phone) as string;

        const { error: insertError } = await client.from('profiles').insert({
          id: session.user.id,
          email,
          phone,
          full_name: formatDisplayName(fullName),
        });

        if (insertError) {
          setError(insertError.message);
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
