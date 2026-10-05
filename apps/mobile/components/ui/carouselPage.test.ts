import { describe, expect, it } from 'vitest';
import { pageIndex, shouldScrollTo, stepPage } from './carouselPage';

describe('pageIndex', () => {
  it('maps an exact page offset to that page', () => {
    expect(pageIndex(0, 390, 3)).toBe(0);
    expect(pageIndex(390, 390, 3)).toBe(1);
    expect(pageIndex(780, 390, 3)).toBe(2);
  });

  it('rounds to the nearer page mid-swipe', () => {
    expect(pageIndex(194, 390, 3)).toBe(0);
    expect(pageIndex(196, 390, 3)).toBe(1);
  });

  it('clamps an over-scroll bounce at either end', () => {
    expect(pageIndex(-120, 390, 3)).toBe(0);
    expect(pageIndex(1200, 390, 3)).toBe(2);
  });

  it('is 0 before onLayout has measured a width, instead of NaN', () => {
    expect(pageIndex(0, 0, 3)).toBe(0);
    expect(pageIndex(390, 0, 3)).toBe(0);
  });

  it('is 0 for an empty carousel', () => {
    expect(pageIndex(390, 390, 0)).toBe(0);
  });

  it('survives a negative or non-finite width', () => {
    expect(pageIndex(390, -390, 3)).toBe(0);
    expect(pageIndex(390, Number.NaN, 3)).toBe(0);
  });

  it('tracks a narrower width after a rotation, rather than the old one', () => {
    // The defect this exists to prevent: welcome.tsx reads Dimensions once at
    // MODULE scope, so after a rotation it keeps dividing by the portrait width
    // and reports page 2 while page 1 is on screen.
    expect(pageIndex(844, 844, 3)).toBe(1);
    expect(pageIndex(844, 390, 3)).toBe(2);
  });
});

describe('shouldScrollTo', () => {
  it('skips the scroll when the page is the one the user just swiped to', () => {
    // The mid-drag case: onScroll rounded to page 1 at the half-way point, the
    // state change re-ran the effect, and `current` equals what the finger did.
    expect(shouldScrollTo(1, 1)).toBe(false);
    expect(shouldScrollTo(0, 0)).toBe(false);
    expect(shouldScrollTo(2, 2)).toBe(false);
  });

  it('scrolls when a controlled caller moves to a different page than the swipe', () => {
    expect(shouldScrollTo(2, 1)).toBe(true);
    expect(shouldScrollTo(0, 1)).toBe(true);
  });

  it('scrolls when nothing was swiped — a "Next" button, or a rotation changing the width', () => {
    expect(shouldScrollTo(0, null)).toBe(true);
    expect(shouldScrollTo(1, null)).toBe(true);
  });

  it('scrolls back to a page the user once swiped to, once that swipe has been consumed', () => {
    // The caller clears `swipedTo` after each consult. Modelled here because the
    // failure it prevents is a sequence, not a single call: swipe to 1, press
    // "Next" to 2, press "Back" to 1 — the last must scroll.
    let swipedTo: number | null = 1; // the user's swipe
    const consult = (current: number) => {
      const scroll = shouldScrollTo(current, swipedTo);
      swipedTo = null;
      return scroll;
    };
    expect(consult(1)).toBe(false); // the swipe's own state change
    expect(consult(2)).toBe(true); // "Next"
    expect(consult(1)).toBe(true); // "Back" — would be false if swipedTo had stuck
  });
});

describe('stepPage', () => {
  it('moves one page forward on increment and back on decrement', () => {
    expect(stepPage(0, 'increment', 3)).toBe(1);
    expect(stepPage(2, 'decrement', 3)).toBe(1);
  });

  it('stops at both ends instead of wrapping', () => {
    expect(stepPage(2, 'increment', 3)).toBe(2);
    expect(stepPage(0, 'decrement', 3)).toBe(0);
  });

  it('ignores any other action', () => {
    expect(stepPage(1, 'activate', 3)).toBe(1);
  });
});
