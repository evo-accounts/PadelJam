import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  onTabs: false,
  swipe: { changed: false, reason: 'no change' } as { changed: boolean; reason?: string },
  tabsAfterRelaunch: true,
  relaunches: 0,
  swipes: 0,
  captured: [] as string[],
}));

vi.mock('./a11y', () => ({
  keyboardTop: () => null,
  snapshot: async () => [],
  query: () => (h.onTabs ? { AXLabel: 'x' } : null),
  describeSelector: () => '',
}));
vi.mock('./actions', () => ({
  scrollUntilVisible: vi.fn(),
  swipe: vi.fn(),
  tap: vi.fn(),
  typeText: vi.fn(),
  tryBackGesture: async () => { h.swipes++; return h.swipe; },
}));
vi.mock('./expect', () => ({
  captureFailure: async (r: string) => { h.captured.push(r); return '/tmp/x'; },
  expectVisible: vi.fn(),
  waitFor: vi.fn(),
}));
vi.mock('./app', () => ({
  relaunch: async () => { h.relaunches++; h.onTabs = h.tabsAfterRelaunch; },
}));
vi.mock('../fixtures/mailpit', () => ({ latestOtp: vi.fn() }));
vi.mock('../fixtures/personas', () => ({ PERSONAS: {} }));

import { ensureTabs } from './flows';

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(h, { onTabs: false, swipe: { changed: false, reason: 'no change' }, tabsAfterRelaunch: true, relaunches: 0, swipes: 0, captured: [] });
});

async function run(p: Promise<void>) {
  const settled = p.then(() => null, (e: Error) => e);
  await vi.runAllTimersAsync();
  return settled;
}

describe('ensureTabs', () => {
  it('relaunches when a swipe changes nothing, and returns once the tabs show', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await run(ensureTabs())).toBeNull();
    expect(h.swipes).toBe(1);
    expect(h.relaunches).toBe(1);
    expect(h.captured).toEqual([]);
    expect(warn).toHaveBeenCalledWith('[e2e] ensureTabs: back gesture did not pop, relaunching');
  });

  it('still throws when the tabs do not show after the relaunch', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.tabsAfterRelaunch = false;
    const err = await run(ensureTabs());
    expect(err?.message).toMatch(/failed to reach the tab bar/);
    expect(h.captured).toHaveLength(1);
  });

  it('returns without swiping when already on the tabs', async () => {
    h.onTabs = true;
    expect(await run(ensureTabs())).toBeNull();
    expect(h.swipes).toBe(0);
  });
});
