'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18n } from 'i18next';
import { createI18n } from '@padel/i18n';
import { useAuthCacheReset } from '@padel/api';
import { SessionProvider } from '@padel/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TypedClient } from '@padel/db';
import { supabase } from '@/lib/supabase/client';
import { registerWebAuthCopy, registerWebAppCopy, registerWebProfileCopy, registerWebSettingsCopy, registerWebCommunityCopy, registerWebGroupCopy, registerWebEventCopy, registerWebChatCopy, registerWebNotificationsCopy } from '@/lib/i18n-web';
import { initSentry } from '@/lib/sentry';
import { resolveLocale } from '@/lib/locale';

const client = supabase as unknown as TypedClient;

const queryClient = new QueryClient();

function AuthCacheReset() {
  useAuthCacheReset();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [i18n, setI18n] = useState<I18n | null>(null);

  useEffect(() => {
    // DSN-guarded; no-op locally / without a DSN.
    initSentry();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      // Prefer the signed-in user's saved locale; fall back to the browser's. This is the same
      // read mobile does in `app/_layout.tsx`, for the same reason: App preferences persists the
      // choice to `profiles.locale`, and reading only `navigator.language` threw it away on every
      // page load — the language applied, then reverted the moment the user refreshed.
      //
      // A raw client call rather than `useMyProfile`: this runs ABOVE `QueryClientProvider` and
      // `SessionProvider` (below), so no hook is callable here. A signed-out visitor has no
      // session and pays for no query.
      let candidate: string | undefined;
      try {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (session?.user) {
          const { data } = await client
            .from('profiles')
            .select('locale')
            .eq('id', session.user.id)
            .maybeSingle();
          candidate = data?.locale ?? undefined;
        }
      } catch {
        // ignore — fall back to the browser locale
      }
      if (!candidate && typeof navigator !== 'undefined') candidate = navigator.language;
      const locale = resolveLocale(candidate);

      const instance = await createI18n(locale);
      registerWebAuthCopy(instance);
      registerWebAppCopy(instance);
      registerWebProfileCopy(instance);
      registerWebSettingsCopy(instance);
      registerWebCommunityCopy(instance);
      registerWebGroupCopy(instance);
      registerWebEventCopy(instance);
      registerWebChatCopy(instance);
      registerWebNotificationsCopy(instance);
      // `app/layout.tsx` renders `<html lang="en">` on the server, which is wrong for every
      // Portuguese user and is what a screen reader announces the page in. Correct it here, and
      // again on every change of language, so the attribute tracks what is actually on screen.
      document.documentElement.lang = locale;
      instance.on('languageChanged', (lng) => {
        document.documentElement.lang = lng;
      });
      if (active) setI18n(instance);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!i18n) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider client={client}>
          <AuthCacheReset />
          {children}
        </SessionProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
