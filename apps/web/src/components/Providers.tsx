'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18n } from 'i18next';
import { createI18n } from '@padel/i18n';
import { SessionProvider } from '@padel/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TypedClient } from '@padel/db';
import { supabase } from '@/lib/supabase/client';
import { registerWebAuthCopy, registerWebAppCopy } from '@/lib/i18n-web';
import { initSentry } from '@/lib/sentry';
import { resolveLocale } from '@/lib/locale';

const client = supabase as unknown as TypedClient;

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  const [i18n, setI18n] = useState<I18n | null>(null);

  useEffect(() => {
    // DSN-guarded; no-op locally / without a DSN.
    initSentry();
  }, []);

  useEffect(() => {
    let active = true;
    // Resolve the locale from the device. TODO: prefer profiles.locale once
    // authenticated (left to a later task; do not fetch the profile here).
    const locale = resolveLocale(
      typeof navigator !== 'undefined' ? navigator.language : undefined,
    );
    createI18n(locale).then((instance) => {
      registerWebAuthCopy(instance);
      registerWebAppCopy(instance);
      if (active) setI18n(instance);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!i18n) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider client={client}>{children}</SessionProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
