import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ labels: ['a'] as string[], captured: [] as string[], swipes: 0 }));

vi.mock('./a11y', () => ({
  snapshot: async () => h.labels.map((l) => ({ type: 'Text', AXLabel: l, frame: { x: 0, y: 200, width: 10, height: 10 } })),
  query: () => null,
  describeSelector: () => '',
  keyboardTop: () => null,
}));
vi.mock('./idb', () => ({
  idbKey: vi.fn(), idbTap: vi.fn(), idbText: vi.fn(),
  idbSwipe: async () => { h.swipes++; },
}));
vi.mock('./keyboardDismiss', () => ({ dismissCaptions: vi.fn() }));
vi.mock('./expect', () => ({
  captureFailure: async (r: string) => { h.captured.push(r); return '/tmp/x'; },
  waitFor: vi.fn(),
}));

import { backGesture, tryBackGesture } from './actions';

beforeEach(() => { vi.useFakeTimers(); h.labels = ['a']; h.captured = []; h.swipes = 0; });

describe('back gesture', () => {
  it('backGesture() throws and captures artifacts when the screen does not change', async () => {
    const settled = backGesture().then(() => null, (e: Error) => e);
    await vi.runAllTimersAsync();
    const err = await settled;
    expect(err?.message).toMatch(/did not change the screen/);
    expect(h.captured).toHaveLength(1);
  });

  it('tryBackGesture() reports the failure without capturing', async () => {
    const p = tryBackGesture();
    await vi.runAllTimersAsync();
    expect(await p).toMatchObject({ changed: false });
    expect(h.captured).toEqual([]);
  });
});
