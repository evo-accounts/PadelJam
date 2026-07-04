'use client';

import { useState } from 'react';
import { useT } from '@padel/i18n';
import { COMPLETE_ACCOUNT_ERROR_CODES, type useAuthFlow } from '@/lib/useAuthFlow';

type Flow = ReturnType<typeof useAuthFlow>;

export function CreateAccountStep({ flow }: { flow: Flow }) {
  const { t } = useT('auth');
  const [fullName, setFullName] = useState('');
  const [secondaryIdentifier, setSecondaryIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // The primary identifier came in via email; the missing secondary is phone (and vice versa).
  const secondaryIsPhone = flow.kind === 'email';
  const secondaryLabel = secondaryIsPhone ? t('secondaryPhoneLabel') : t('secondaryEmailLabel');

  // Error values that are i18n keys (set by the flow hook); anything else is a raw message.
  const displayError =
    flow.error && COMPLETE_ACCOUNT_ERROR_CODES.has(flow.error) ? t(flow.error) : flow.error;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void flow.completeAccount({ fullName, secondaryIdentifier, password });
      }}
    >
      <h1 className="text-2xl font-semibold">{t('createAccountTitle')}</h1>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('fullNameLabel')}</span>
        <input
          type="text"
          autoComplete="name"
          autoFocus
          className="rounded-md border border-input px-3 py-2"
          placeholder={t('fullNamePlaceholder')}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>{secondaryLabel}</span>
        <input
          type={secondaryIsPhone ? 'tel' : 'email'}
          autoComplete={secondaryIsPhone ? 'tel' : 'email'}
          className="rounded-md border border-input px-3 py-2"
          value={secondaryIdentifier}
          onChange={(e) => setSecondaryIdentifier(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('passwordLabel')}</span>
        <input
          type="password"
          autoComplete="new-password"
          className="rounded-md border border-input px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {displayError ? <p className="text-sm text-destructive">{displayError}</p> : null}
      <button
        type="submit"
        disabled={flow.busy || !fullName.trim() || !secondaryIdentifier.trim() || !password}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {t('createAccount')}
      </button>
    </form>
  );
}
