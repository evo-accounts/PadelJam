'use client';

import { useRef, useState } from 'react';
import type { SafeMessage } from '@padel/auth';
import { useT } from '@padel/i18n';
import { classifyIdentifier, invalidIdentifierMessage } from '@/lib/identifier';
import type { useAuthFlow } from '@/lib/useAuthFlow';
import { AuthError } from './AuthError';

type Flow = ReturnType<typeof useAuthFlow>;

export function IdentifierStep({ flow }: { flow: Flow }) {
  const { t } = useT('auth');
  const [invalid, setInvalid] = useState<SafeMessage | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Continue is never disabled for an empty or malformed entry. It used to be disabled until the
  // field was non-empty, and then sent anything at all — so "abc" cost a rate-limited request and
  // came back as GoTrue's raw English. Mobile's sign-in validates on tap (sign-in.tsx): the field
  // is marked and the message says what is wrong, and nothing is sent. This does the same.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = classifyIdentifier(flow.identifier);
    if (!c.ok) {
      setInvalid(invalidIdentifierMessage(c.reason));
      inputRef.current?.focus();
      return;
    }
    void flow.sendOtp();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('identifierLabel')}</span>
        <input
          ref={inputRef}
          type="text"
          autoComplete="username"
          autoFocus
          className="rounded-md border border-input px-3 py-2 aria-invalid:border-destructive"
          placeholder={t('identifierPlaceholder')}
          value={flow.identifier}
          onChange={(e) => {
            flow.setIdentifier(e.target.value);
            if (invalid) setInvalid(null);
          }}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? 'identifier-error' : undefined}
        />
      </label>
      {invalid ? (
        <p id="identifier-error" className="text-sm text-destructive">
          {t(invalid.key, { ns: invalid.ns })}
        </p>
      ) : null}
      <AuthError error={flow.error} />
      <button
        type="submit"
        disabled={flow.busy}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {t('continue')}
      </button>
    </form>
  );
}
