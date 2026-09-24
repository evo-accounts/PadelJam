'use client';

import { useEffect, useState } from 'react';
import { useT } from '@padel/i18n';
import type { useAuthFlow } from '@/lib/useAuthFlow';
import { AuthError } from './AuthError';

type Flow = ReturnType<typeof useAuthFlow>;


export function VerifySecondaryStep({ flow }: { flow: Flow }) {
  const { t } = useT('auth');
  const [code, setCode] = useState('');
  const [tick, setTick] = useState(0);

  // Re-render once per second so the resend cooldown countdown stays current.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const cooldownSeconds = Math.ceil(flow.cooldownRemainingMs / 1000);
  const onCooldown = cooldownSeconds > 0;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void flow.verifySecondary(code);
      }}
    >
      <h1 className="text-2xl font-semibold">
        {flow.secondaryKind === 'phone' ? t('verifyPhoneTitle') : t('verifyEmailTitle')}
      </h1>
      <p className="text-sm text-muted-foreground">{t('otpHelp', { identifier: flow.secondary })}</p>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('otpLabel')}</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          className="rounded-md border border-input px-3 py-2 tracking-[0.5em]"
          placeholder={t('otpPlaceholder')}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      {flow.locked ? <p className="text-sm text-destructive">{t('locked')}</p> : null}
      {!flow.locked ? <AuthError error={flow.error} /> : null}
      <button
        type="submit"
        disabled={flow.busy || flow.locked || code.length < 6}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {t('verify')}
      </button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => void flow.resendSecondary()}
          disabled={flow.busy || onCooldown}
          className="text-primary disabled:text-muted-foreground"
        >
          {onCooldown ? t('cooldown', { seconds: cooldownSeconds }) : t('resend')}
        </button>
        <button type="button" onClick={flow.skipSecondary} disabled={flow.busy} className="text-primary">
          {t('skipForNow')}
        </button>
      </div>
    </form>
  );
}
