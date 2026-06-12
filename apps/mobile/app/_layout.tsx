import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionProvider } from '@padel/auth';
import { createI18n } from '@padel/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Localization from 'expo-localization';
import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import type { i18n as I18n } from 'i18next';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { useT } from '@padel/i18n';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { registerMobileCopy } from '@/lib/i18n-mobile';
import { resolveLocale } from '@/lib/locale';
import { initSentry } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';

// DSN-guarded; no-op locally / without a DSN. Safe at module scope.
initSentry();

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

// We drive the splash + routing ourselves; prevent the native splash from
// auto-hiding so there is no flash before the JS splash takes over.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op: already hidden */
});

const SPLASH_MIN_MS = 600;
const SPLASH_MAX_MS = 4000;
const HAS_SEEN_WELCOME = 'hasSeenWelcome';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const queryClient = new QueryClient();

export default function RootLayout() {
  const [i18n, setI18n] = useState<I18n | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Resolve the locale from the device. TODO: prefer profiles.locale once
    // authenticated (left to a later task; do not fetch the profile here).
    const deviceLocale = Localization.getLocales()[0];
    const locale = resolveLocale(deviceLocale?.languageTag ?? deviceLocale?.languageCode ?? undefined);
    createI18n(locale)
      .then((instance) => {
        registerMobileCopy(instance);
        if (!cancelled) setI18n(instance);
      })
      .catch(() => {
        // Even on failure, fall back to a bare instance so the tree can render.
        createI18n('en').then((fallback) => {
          if (!cancelled) {
            registerMobileCopy(fallback);
            setI18n(fallback);
          }
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!i18n) {
    // i18n not ready yet; keep the native splash visible (return null).
    return null;
  }

  return (
    <I18nextProvider i18n={i18n}>
      <SessionProvider client={supabase}>
        <QueryClientProvider client={queryClient}>
          <Boot />
        </QueryClientProvider>
      </SessionProvider>
    </I18nextProvider>
  );
}

type Target = '(tabs)' | '(onboarding)' | 'welcome' | 'sign-in';

/**
 * Splash boot routing (Requirements §03):
 * - waits at least SPLASH_MIN_MS, at most SPLASH_MAX_MS
 * - reads the session; if a user exists, checks profiles.onboarded_at
 * - routes: authed+onboarded -> (tabs); authed+not-onboarded -> (onboarding);
 *   unauthenticated+first-install -> (auth)/welcome; returning -> (auth)/sign-in
 */
function Boot() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolve = async (): Promise<Target> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarded_at')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profile?.onboarded_at) return '(tabs)';
        // Authed but no profile row yet OR not onboarded -> onboarding skeleton.
        return '(onboarding)';
      }

      const seen = await AsyncStorage.getItem(HAS_SEEN_WELCOME);
      return seen ? 'sign-in' : 'welcome';
    };

    const run = async () => {
      // Race the resolution against a hard cap; on timeout, treat as unauthenticated.
      let target: Target = 'sign-in';
      try {
        const resolved = await Promise.race<Target>([
          resolve(),
          delay(SPLASH_MAX_MS).then<Target>(async () => {
            const seen = await AsyncStorage.getItem(HAS_SEEN_WELCOME);
            return seen ? 'sign-in' : 'welcome';
          }),
        ]);
        target = resolved;
      } catch {
        const seen = await AsyncStorage.getItem(HAS_SEEN_WELCOME);
        target = seen ? 'sign-in' : 'welcome';
      }

      await delay(SPLASH_MIN_MS);
      if (cancelled) return;

      if (target === '(tabs)') router.replace('/(tabs)');
      else if (target === '(onboarding)') router.replace('/(onboarding)/location');
      else if (target === 'welcome') router.replace('/(auth)/welcome');
      else router.replace('/(auth)/sign-in');

      setReady(true);
      SplashScreen.hideAsync().catch(() => {
        /* no-op */
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <RootNav>
      {!ready ? <SplashView /> : null}
    </RootNav>
  );
}

function RootNav({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="community" />
        <Stack.Screen name="group" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      {children}
    </ThemeProvider>
  );
}

function SplashView() {
  const { t } = useT('common');
  return (
    <View style={styles.splash} pointerEvents="none">
      <Text style={styles.brand}>{t('appName')}</Text>
      <ActivityIndicator color="#fff" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1F3A',
  },
  brand: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  spinner: {
    marginTop: 24,
  },
});
