// FIRST import, deliberately: there is no WebCrypto global in this runtime, and
// without one supabase-js builds its PKCE verifier from Math.random() and sends
// a `plain` challenge. See the file for the full explanation.
import '@/lib/cryptoPolyfill';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthCacheReset } from '@padel/api';
import { SessionProvider } from '@padel/auth';
import { createI18n } from '@padel/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Localization from 'expo-localization';
import * as SplashScreen from 'expo-splash-screen';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  usePathname,
  useRouter,
} from 'expo-router';
import type { i18n as I18n } from 'i18next';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { useT } from '@padel/i18n';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { StreamChatProvider } from '@/components/chat/StreamChatProvider';
import { BannerProvider, SheetHost } from '@/components/ui';
import { useColorScheme } from '@/components/useColorScheme';
import { registerMobileCopy } from '@/lib/i18n-mobile';
import { resolveLocale } from '@/lib/locale';
import { resolvePostAuthRoute } from '@/lib/postAuthRoute';
import { usePushTapRouting } from '@/lib/usePushTapRouting';
import { initSentry } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';
import { colors } from '../theme';

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
    (async () => {
      // Prefer the signed-in user's saved locale; fall back to the device locale.
      let candidate: string | undefined;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          const { data } = await supabase.from('profiles').select('locale').eq('id', session.user.id).maybeSingle();
          candidate = data?.locale ?? undefined;
        }
      } catch {
        // ignore — fall back to device locale
      }
      if (!candidate) {
        const deviceLocale = Localization.getLocales()[0];
        candidate = deviceLocale?.languageTag ?? deviceLocale?.languageCode ?? undefined;
      }
      const locale = resolveLocale(candidate);
      try {
        const instance = await createI18n(locale);
        registerMobileCopy(instance);
        if (!cancelled) setI18n(instance);
      } catch {
        const fallback = await createI18n('en');
        registerMobileCopy(fallback);
        if (!cancelled) setI18n(fallback);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!i18n) {
    // i18n not ready yet; keep the native splash visible (return null).
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <I18nextProvider i18n={i18n}>
        <BannerProvider>
          <SheetHost>
            <SessionProvider client={supabase}>
              <QueryClientProvider client={queryClient}>
                <StreamChatProvider>
                  <Boot />
                </StreamChatProvider>
              </QueryClientProvider>
            </SessionProvider>
          </SheetHost>
        </BannerProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}

type OnboardingRoute =
  | '/(onboarding)/location'
  | '/(onboarding)/hand'
  | '/(onboarding)/side'
  | '/(onboarding)/jammer-plus';
type Target =
  | 'welcome'
  | 'sign-in'
  | '/(tabs)'
  | '/(auth)/sign-in'
  | '/(auth)/create-account'
  | OnboardingRoute;

/**
 * Splash boot routing (Requirements §03):
 * - waits at least SPLASH_MIN_MS, at most SPLASH_MAX_MS
 * - reads the session; if a user exists, checks profiles.onboarded_at
 * - routes: authed+onboarded -> (tabs); authed+not-onboarded -> the first unanswered
 *   onboarding step (location -> hand -> side -> jammer-plus);
 *   unauthenticated+first-install -> (auth)/welcome; returning -> (auth)/sign-in
 */
// The splash boot routing must run at most once per JS process: if this subtree
// ever remounts after sign-in (e.g. a provider changing its tree shape), a
// re-run would re-resolve the route, and any transient failure in that
// re-resolve would bounce an authenticated user back to sign-in.
let bootCompleted = false;

// Exported for tests only — expo-router ignores extra named exports on layout routes.
export function Boot() {
  const router = useRouter();
  const [ready, setReady] = useState(bootCompleted);
  // Where the router actually is when the redirect below is finally ready to
  // fire. Read through a ref because `run` is started once by an effect with no
  // deps and would otherwise close over the pathname as it was at mount — which
  // is always the entry route. Assigned after commit rather than during render,
  // for the reason spelled out in lib/usePushTapRouting.ts.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  });

  usePushTapRouting();
  useAuthCacheReset();

  useEffect(() => {
    if (bootCompleted) return;
    let cancelled = false;

    const resolve = async (): Promise<Target> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        return (await resolvePostAuthRoute()) as Target;
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
      bootCompleted = true;

      // '/(tabs)' WITH the slash: onboardingRoute() returns '/(tabs)' for an
      // onboarded profile, so the slashless comparison this used to make never
      // matched. The leg was dead and the generic replace below was quietly
      // doing its work — which is also why the guard below has to live here.
      if (target === '/(tabs)') {
        // Resolving the route takes a network round trip, so a deep link or a
        // cold-start push tap can navigate BEFORE this runs — and replacing
        // then threw their screen away and dropped the user on Home. Whichever
        // landed last won, so it was a coin flip that tipped whenever the
        // resolve ran slow. Nothing has navigated iff we are still on the entry
        // route ('/' = app/index.tsx), which is the only case that still needs
        // the push to (tabs); a link has already put the user somewhere valid.
        //
        // Deliberately only this leg. 'welcome', 'sign-in' and the onboarding
        // steps are redirects AWAY from screens the user may have no right to,
        // so they must fire whether or not a link got there first.
        if (pathnameRef.current === '/') router.replace('/(tabs)');
      } else if (target === 'welcome') router.replace('/(auth)/welcome');
      else if (target === 'sign-in') router.replace('/(auth)/sign-in');
      else {
        router.replace(target); // target is an OnboardingRoute string
      }

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
        <Stack.Screen name="event" />
        <Stack.Screen name="search" />
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
      <ActivityIndicator color={colors.card} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  brand: {
    color: colors.card,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  spinner: {
    marginTop: 24,
  },
});
