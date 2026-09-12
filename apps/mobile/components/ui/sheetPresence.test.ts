import { describe, expect, it } from 'vitest';

import { SheetPresence } from './sheetPresence';

/** Resolves a microtask so a settled (or still-pending) promise can be observed. */
const flushMicrotasks = () => Promise.resolve().then(() => Promise.resolve());

describe('SheetPresence', () => {
  it('a fresh instance, never presented, resolves waitClosed immediately', async () => {
    const presence = new SheetPresence();
    let settled = false;
    void presence.waitClosed(true).then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(true);
  });

  it('stays pending after markPresented() until markDismissed()', async () => {
    const presence = new SheetPresence();
    presence.markPresented();
    let settled = false;
    void presence.waitClosed(true).then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false);

    presence.markDismissed();
    await flushMicrotasks();
    expect(settled).toBe(true);
  });

  it('two concurrent waitClosed() calls both resolve on one markDismissed(), and the resolver list is cleared', async () => {
    const presence = new SheetPresence();
    presence.markPresented();
    let firstSettled = false;
    let secondSettled = false;
    void presence.waitClosed(true).then(() => {
      firstSettled = true;
    });
    void presence.waitClosed(true).then(() => {
      secondSettled = true;
    });
    await flushMicrotasks();
    expect(firstSettled).toBe(false);
    expect(secondSettled).toBe(false);

    presence.markDismissed();
    await flushMicrotasks();
    expect(firstSettled).toBe(true);
    expect(secondSettled).toBe(true);

    // A third call after a fresh markPresented() stays pending until the next dismiss —
    // proof the resolver list was actually cleared, not just drained past two entries.
    presence.markPresented();
    let thirdSettled = false;
    void presence.waitClosed(true).then(() => {
      thirdSettled = true;
    });
    await flushMicrotasks();
    expect(thirdSettled).toBe(false);

    presence.markDismissed();
    await flushMicrotasks();
    expect(thirdSettled).toBe(true);
  });

  it('a superseded request stays pending across another markPresented() and settles on the next markDismissed()', async () => {
    const presence = new SheetPresence();
    presence.markPresented();
    // The host is presented and the queue is non-empty (e.g. a destructive row's
    // action sheet superseded by its own auto-triggered confirm step).
    let settled = false;
    void presence.waitClosed(false).then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false);

    // The superseding request re-presents the same Modal with new content.
    presence.markPresented();
    await flushMicrotasks();
    expect(settled).toBe(false);

    presence.markDismissed();
    await flushMicrotasks();
    expect(settled).toBe(true);
  });
});
