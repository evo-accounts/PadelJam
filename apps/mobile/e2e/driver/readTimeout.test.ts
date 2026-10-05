import { describe, expect, it, vi } from 'vitest';

// expect.ts pulls in the idb driver; nothing here touches a simulator.
vi.mock('./idb', () => ({}));
vi.mock('./a11y', () => ({}));
vi.mock('./sim', () => ({}));

const { readTimeout } = await import('./expect');

describe('readTimeout', () => {
  const now = 1_000_000;

  it('caps a read at 10 s however long the wait still has', () => {
    expect(readTimeout(now + 60_000, now)).toBe(10_000);
  });

  it('follows the time left in between', () => {
    expect(readTimeout(now + 7_500, now)).toBe(7_500);
  });

  it('never cuts a read below 5 s, even at or past the deadline', () => {
    expect(readTimeout(now + 1_000, now)).toBe(5_000);
    expect(readTimeout(now - 1_000, now)).toBe(5_000);
  });
});
