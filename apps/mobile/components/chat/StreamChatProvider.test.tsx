// @vitest-environment jsdom
/**
 * Regression tests for the post-OTP bounce: StreamChatProvider must keep a
 * STABLE element tree across auth transitions. When its wrapper switched from
 * a fragment (signed out) to OverlayProvider/Chat (signed in), React unmounted
 * and remounted the entire child subtree — including the root navigator and the
 * Boot splash-routing effect — right after sign-in, which could re-route a
 * freshly authenticated user back to the sign-in screen.
 */
import { act, createElement, useEffect, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Mutable auth state read by the mocked useSession.
const auth: { session: { user: { id: string } } | null } = { session: null };

vi.mock('@padel/auth', () => ({
  useSession: () => ({ client: {}, session: auth.session, loading: false }),
}));
vi.mock('@padel/api', () => ({
  useStreamToken: () => ({ data: undefined }),
  useMyProfile: () => ({ data: undefined }),
}));
vi.mock('stream-chat-expo', () => ({
  Chat: ({ children }: PropsWithChildren) => children,
  OverlayProvider: ({ children }: PropsWithChildren) => children,
  WithComponents: ({ children }: PropsWithChildren) => children,
}));
// The overrides render the app's Avatar, which pulls React Native into this DOM test.
vi.mock('./chatComponents', () => ({ chatComponents: {} }));

let probeMounts = 0;
let probeUnmounts = 0;
function Probe() {
  useEffect(() => {
    probeMounts++;
    return () => {
      probeUnmounts++;
    };
  }, []);
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function renderProvider(Provider: (p: PropsWithChildren) => unknown) {
  await act(async () => {
    root.render(createElement(Provider as never, null, createElement(Probe)));
  });
}

async function importProviderWithStreamEnabled(enabled: boolean) {
  vi.doMock('@/lib/streamClient', () => ({
    streamClient: { userID: undefined, disconnectUser: vi.fn(), connectUser: vi.fn() },
    streamEnabled: enabled,
  }));
  const mod = await import('./StreamChatProvider');
  return mod.StreamChatProvider;
}

beforeEach(() => {
  vi.resetModules();
  auth.session = null;
  probeMounts = 0;
  probeUnmounts = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('StreamChatProvider tree stability', () => {
  it('does not remount children when a session appears (stream disabled)', async () => {
    const Provider = await importProviderWithStreamEnabled(false);

    await renderProvider(Provider);
    expect(probeMounts).toBe(1);

    auth.session = { user: { id: 'user-1' } };
    await renderProvider(Provider);

    expect(probeUnmounts).toBe(0);
    expect(probeMounts).toBe(1);
  });

  it('does not remount children when a session appears (stream enabled)', async () => {
    const Provider = await importProviderWithStreamEnabled(true);

    await renderProvider(Provider);
    expect(probeMounts).toBe(1);

    auth.session = { user: { id: 'user-1' } };
    await renderProvider(Provider);

    expect(probeUnmounts).toBe(0);
    expect(probeMounts).toBe(1);
  });

  it('does not remount children when the session goes away (sign-out)', async () => {
    const Provider = await importProviderWithStreamEnabled(true);

    auth.session = { user: { id: 'user-1' } };
    await renderProvider(Provider);
    expect(probeMounts).toBe(1);

    auth.session = null;
    await renderProvider(Provider);

    expect(probeUnmounts).toBe(0);
    expect(probeMounts).toBe(1);
  });
});
