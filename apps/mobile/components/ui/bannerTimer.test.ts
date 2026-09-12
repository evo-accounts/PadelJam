import { describe, expect, it, vi } from 'vitest';
import { BannerTimer } from './bannerTimer';

describe('BannerTimer', () => {
  it('shows a message and hides it after the timeout', () => {
    vi.useFakeTimers();
    const seen: Array<{ message: string; tone: 'error' | 'success' } | null> = [];
    const timer = new BannerTimer(4000, (s) => seen.push(s));
    timer.show('Missing information', 'error');
    expect(seen.at(-1)).toEqual({ message: 'Missing information', tone: 'error' });
    vi.advanceTimersByTime(3999);
    expect(seen.at(-1)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(seen.at(-1)).toBeNull();
    vi.useRealTimers();
  });

  it('a new message restarts the timeout', () => {
    vi.useFakeTimers();
    const seen: Array<unknown> = [];
    const timer = new BannerTimer(4000, (s) => seen.push(s));
    timer.show('a', 'error');
    vi.advanceTimersByTime(3000);
    timer.show('b', 'success');
    vi.advanceTimersByTime(3000);
    expect(seen.at(-1)).toEqual({ message: 'b', tone: 'success' });
    vi.advanceTimersByTime(1000);
    expect(seen.at(-1)).toBeNull();
    vi.useRealTimers();
  });

  it('touch dismisses immediately', () => {
    vi.useFakeTimers();
    const seen: Array<unknown> = [];
    const timer = new BannerTimer(4000, (s) => seen.push(s));
    timer.show('a', 'error');
    timer.dismiss();
    expect(seen.at(-1)).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(seen.filter((s) => s === null)).toHaveLength(1);
    vi.useRealTimers();
  });
});
