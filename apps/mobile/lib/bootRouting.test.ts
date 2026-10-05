// @vitest-environment jsdom
/**
 * Regression tests for the post-OTP bounce: the splash boot routing in
 * app/_layout.tsx must run AT MOST ONCE per JS process. If the layout subtree
 * remounts after sign-in (e.g. a provider changing its tree shape), a re-run
 * would re-resolve the route — and any transient failure in that re-resolve
 * (profile fetch error, 4s cap) would kick an authenticated user to sign-in.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const { routerMock, pathnameRef, sessionRef } = vi.hoisted(() => ({
  routerMock: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
  // What expo-router reports as the current route. '/' is app/index.tsx, the
  // entry route nothing has navigated away from yet.
  pathnameRef: { current: '/' },
  sessionRef: { current: { user: { id: 'user-1' } } as { user: { id: string } } | null },
}));

const passthrough = ({ children }: { children?: unknown }) => children ?? null;

vi.mock('expo-router', () => {
  const Stack = Object.assign(passthrough, { Screen: () => null });
  return {
    useRouter: () => routerMock,
    usePathname: () => pathnameRef.current,
    Stack,
    ThemeProvider: passthrough,
    DarkTheme: { fonts: {} },
    DefaultTheme: { fonts: {} },
    ErrorBoundary: () => null,
  };
});
vi.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => Promise.resolve(),
  hideAsync: () => Promise.resolve(),
}));
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en' }] }));
vi.mock('react-native', () => ({
  ActivityIndicator: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Text: passthrough,
  View: passthrough,
}));
vi.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: passthrough }));
vi.mock('react-native-reanimated', () => ({ default: {} }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: () => Promise.resolve('1'), setItem: () => Promise.resolve() },
}));
vi.mock('@tanstack/react-query', () => ({
  QueryClient: class {},
  QueryClientProvider: passthrough,
}));
vi.mock('react-i18next', () => ({ I18nextProvider: passthrough }));
vi.mock('@padel/api', () => ({ useAuthCacheReset: () => {} }));
vi.mock('@padel/auth', () => ({ SessionProvider: passthrough }));
vi.mock('@padel/i18n', () => ({
  createI18n: () => Promise.resolve({}),
  useT: () => ({ t: (k: string) => k }),
}));
vi.mock('@/components/chat/StreamChatProvider', () => ({ StreamChatProvider: passthrough }));
vi.mock('@/components/ui', () => ({
  SheetHost: ({ children }: { children: unknown }) => children,
  BannerProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/components/useColorScheme', () => ({ useColorScheme: () => 'light' }));
vi.mock('@/lib/i18n-mobile', () => ({ registerMobileCopy: () => {} }));
vi.mock('@/lib/locale', () => ({ resolveLocale: () => 'en' }));
vi.mock('@/lib/push', () => ({ registerForPush: () => Promise.resolve() }));
vi.mock('@/lib/usePushTapRouting', () => ({ usePushTapRouting: () => {} }));
vi.mock('@/lib/sentry', () => ({ initSentry: () => {} }));
// Side-effect-only import in _layout; it reaches expo-crypto, which needs the RN
// runtime. Covered on its own in lib/cryptoPolyfill.test.ts.
vi.mock('@/lib/cryptoPolyfill', () => ({}));
vi.mock('@/lib/postAuthRoute', () => ({
  resolvePostAuthRoute: vi.fn(() => Promise.resolve('/(tabs)')),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: sessionRef.current } }),
    },
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  routerMock.replace.mockClear();
  pathnameRef.current = '/';
  sessionRef.current = { user: { id: 'user-1' } };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

async function importBoot() {
  const mod = (await import('../app/_layout')) as unknown as {
    Boot: () => unknown;
  };
  expect(typeof mod.Boot).toBe('function');
  return mod.Boot;
}

describe('splash boot routing runs once per process', () => {
  it('routes on first mount (cold start)', async () => {
    const Boot = await importBoot();
    await act(async () => {
      root.render(createElement(Boot as never));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(routerMock.replace).toHaveBeenCalledTimes(1);
    expect(routerMock.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('does NOT route again when Boot remounts after the first routing', async () => {
    const Boot = await importBoot();
    await act(async () => {
      root.render(createElement(Boot as never));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(routerMock.replace).toHaveBeenCalledTimes(1);

    // Simulate the subtree remount (what a tree-shape change in a provider does).
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(Boot as never));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(routerMock.replace).toHaveBeenCalledTimes(1);
  });

  it('a remount BEFORE the first routing completes still routes exactly once', async () => {
    const Boot = await importBoot();
    await act(async () => {
      root.render(createElement(Boot as never));
    });
    // Unmount mid-boot (before the 600ms splash minimum elapses).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(Boot as never));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(routerMock.replace).toHaveBeenCalledTimes(1);
  });
});

/**
 * Boot resolves the route asynchronously, so anything that navigates while it is
 * still resolving — a deep link, a cold-start push tap — reaches the router
 * FIRST, and the unconditional `router.replace(target)` then threw it away.
 * Whichever landed last won, which made it a coin flip that tipped under load.
 *
 * Seen as an E2E flake (`12-profile-settings > the password row names the screen
 * it opens`: the app sat on Home after `relaunch()` + `deepLink`), but the user-
 * facing half is worse — tapping a push notification with the app closed opened
 * the notification's screen and then bounced to Home.
 *
 * Only the authed-and-onboarded leg defers. The others are redirects away from a
 * screen the user may not have: those must still fire, deep link or not.
 */
describe('splash boot routing does not clobber a route something else chose', () => {
  it('leaves a deep-linked route alone when the user is authed and onboarded', async () => {
    const Boot = await importBoot();
    await act(async () => {
      root.render(createElement(Boot as never));
    });

    // The deep link lands mid-boot: expo-router navigates and Boot re-renders
    // with the new pathname, still inside the 600ms splash minimum.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    pathnameRef.current = '/profile/settings';
    await act(async () => {
      root.render(createElement(Boot as never));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('still redirects an unauthenticated user off a deep-linked screen', async () => {
    sessionRef.current = null;
    const Boot = await importBoot();
    await act(async () => {
      root.render(createElement(Boot as never));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    pathnameRef.current = '/profile/settings';
    await act(async () => {
      root.render(createElement(Boot as never));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(routerMock.replace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('routes normally when nothing else navigated during boot', async () => {
    const Boot = await importBoot();
    await act(async () => {
      root.render(createElement(Boot as never));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(routerMock.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
