'use client';

import { useT } from '@padel/i18n';
import type { useAuthFlow } from '@/lib/useAuthFlow';

type Flow = ReturnType<typeof useAuthFlow>;

export function IdentifierStep({ flow }: { flow: Flow }) {
  const { t } = useT('auth');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void flow.sendOtp();
      }}
    >
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('identifierLabel')}</span>
        <input
          type="text"
          autoComplete="username"
          autoFocus
          className="rounded-md border border-input px-3 py-2"
          placeholder={t('identifierPlaceholder')}
          value={flow.identifier}
          onChange={(e) => flow.setIdentifier(e.target.value)}
        />
      </label>
      {flow.error ? <p className="text-sm text-destructive">{flow.error}</p> : null}
      <button
        type="submit"
        disabled={flow.busy || !flow.identifier.trim()}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {t('continue')}
      </button>
    </form>
  );
}
