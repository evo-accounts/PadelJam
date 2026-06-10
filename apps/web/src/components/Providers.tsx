'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18n } from 'i18next';
import { createI18n } from '@padel/i18n';
import { SessionProvider } from '@padel/auth';
import type { TypedClient } from '@padel/db';
import { supabase } from '@/lib/supabase/client';
import { registerWebAuthCopy } from '@/lib/i18n-web';

const DEFAULT_LOCALE = 'pt-PT' as const;
const client = supabase as unknown as TypedClient;

export function Providers({ children }: { children: ReactNode }) {
  const [i18n, setI18n] = useState<I18n | null>(null);

  useEffect(() => {
    let active = true;
    createI18n(DEFAULT_LOCALE).then((instance) => {
      registerWebAuthCopy(instance);
      if (active) setI18n(instance);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!i18n) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <SessionProvider client={client}>{children}</SessionProvider>
    </I18nextProvider>
  );
}
