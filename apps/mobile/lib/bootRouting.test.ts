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

const { routerMock } = vi.hoisted(() => ({
  routerMock: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
}));

const passthrough = ({ children }: { children?: unknown }) => children ?? null;

vi.mock('expo-router', () => {
  const Stack = Object.assign(passthrough, { Screen: () => null });
  return {
    useRouter: () => routerMock,
    Stack,
    ThemeProvider: passthrough,
    DarkTheme: {},
    DefaultTheme: {},
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
vi.mock('@/components/useColorScheme', () => ({ useColorScheme: () => 'light' }));
vi.mock('@/lib/i18n-mobile', () => ({ registerMobileCopy: () => {} }));
vi.mock('@/lib/locale', () => ({ resolveLocale: () => 'en' }));
vi.mock('@/lib/push', () => ({ registerForPush: () => Promise.resolve() }));
vi.mock('@/lib/usePushTapRouting', () => ({ usePushTapRouting: () => {} }));
vi.mock('@/lib/sentry', () => ({ initSentry: () => {} }));
vi.mock('@/lib/postAuthRoute', () => ({
  resolvePostAuthRoute: vi.fn(() => Promise.resolve('/(tabs)')),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }),
    },
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  routerMock.replace.mockClear();
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
