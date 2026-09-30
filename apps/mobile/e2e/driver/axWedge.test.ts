import { describe, expect, it } from 'vitest';

import { WEDGE_PERSIST_MS, WedgeTracker, isWedgedDescribeError, isWedgedTree } from './axWedge';

const app = (width: number, height: number) => ({
  AXLabel: 'PadelJam',
  AXUniqueId: null,
  AXValue: null,
  type: 'Application',
  role: 'AXApplication',
  enabled: true,
  frame: { x: 0, y: 0, width, height },
});

const button = (AXLabel: string, y: number) => ({
  AXLabel,
  AXUniqueId: null,
  AXValue: null,
  type: 'Button',
  role: 'AXButton',
  enabled: true,
  frame: { x: 16, y, width: 370, height: 52 },
});

/** What `snapshot()` caught on CI run 36695325297 (path and udid shortened). */
const NO_TRANSLATION =
  '/Users/me/Library/Python/3.9/bin/idb ui describe-all --json --udid 5D4B52E5 failed (1):\n'
  + 'No translation object returned for simulator. This means you have likely specified a point '
  + 'onscreen that is invalid or invisible due to a fullscreen dialog';

describe('isWedgedDescribeError', () => {
  it('recognises the AX bridge failure', () => {
    expect(isWedgedDescribeError(NO_TRANSLATION)).toBe(true);
  });

  it('leaves companion connection errors to idb.ts, which restarts the companion for them', () => {
    expect(isWedgedDescribeError('Connection lost')).toBe(false);
    expect(isWedgedDescribeError('Failed to connect to companion')).toBe(false);
  });
});

describe('isWedgedTree', () => {
  it('is the lone zero-size application describe-all returned while wedged', () => {
    expect(isWedgedTree([app(0, 0)])).toBe(true);
  });

  it('is not a lone application with its real frame — a healthy bridge, nothing rendered yet', () => {
    // Suite 04's hook artifact on the same run: this, then a normal tree on the next purge.
    expect(isWedgedTree([app(402, 874)])).toBe(false);
  });

  it('is not a populated tree, even if the application entry had no area', () => {
    expect(isWedgedTree([app(402, 874), button('Start now', 700)])).toBe(false);
    expect(isWedgedTree([app(0, 0), button('Start now', 700)])).toBe(false);
  });

  it('is not a lone zero-size element that is not the application', () => {
    expect(isWedgedTree([{ ...button('Start now', 0), frame: { x: 0, y: 0, width: 0, height: 0 } }])).toBe(false);
  });

  it('is not an empty or malformed reply', () => {
    expect(isWedgedTree([])).toBe(false);
    expect(isWedgedTree({})).toBe(false);
    expect(isWedgedTree([null])).toBe(false);
  });
});

describe('WedgeTracker', () => {
  const clock = () => {
    let t = 1_000_000;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
  };

  it('does not call a wedge that has not persisted', () => {
    const c = clock();
    const w = new WedgeTracker(c.now);
    w.observe(true);
    c.advance(WEDGE_PERSIST_MS - 1);
    w.observe(true);
    expect(w.lastReadWedged).toBe(true);
    expect(w.isWedged()).toBe(false);
  });

  it('calls it once every conclusive read has been wedged for the whole window', () => {
    const c = clock();
    const w = new WedgeTracker(c.now);
    w.observe(true);
    c.advance(WEDGE_PERSIST_MS);
    w.observe(true);
    expect(w.isWedged()).toBe(true);
  });

  it('measures from the FIRST wedged read, not the latest', () => {
    const c = clock();
    const w = new WedgeTracker(c.now);
    w.observe(true);
    for (let i = 0; i < 10; i++) {
      c.advance(WEDGE_PERSIST_MS / 10);
      w.observe(true);
    }
    expect(w.isWedged()).toBe(true);
  });

  it('starts over after one healthy read', () => {
    const c = clock();
    const w = new WedgeTracker(c.now);
    w.observe(true);
    c.advance(WEDGE_PERSIST_MS - 1);
    w.observe(false);
    w.observe(true);
    c.advance(WEDGE_PERSIST_MS - 1);
    expect(w.isWedged()).toBe(false);
  });

  it('forgets everything on reset — the post-reboot clock starts fresh', () => {
    const c = clock();
    const w = new WedgeTracker(c.now);
    w.observe(true);
    c.advance(WEDGE_PERSIST_MS * 3);
    w.reset();
    expect(w.isWedged()).toBe(false);
    expect(w.lastReadWedged).toBe(false);
  });
});
