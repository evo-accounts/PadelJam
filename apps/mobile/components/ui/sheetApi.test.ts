import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { createSheetApi, type Request } from './sheetApi';
import { SheetQueue } from './sheetQueue';

const noopWaitClosed = async () => {};

const setup = (waitClosed: () => Promise<void> = noopWaitClosed) => {
  const q = new SheetQueue<Request, string>();
  return { q, api: createSheetApi(q, waitClosed) };
};

/** A `waitClosed` stub whose promise the test controls explicitly. */
const deferredWaitClosed = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { waitClosed: () => promise, resolve };
};

describe('createSheetApi', () => {
  it('confirm resolves true only on confirm', async () => {
    const { q, api } = setup();
    const p = api.confirm({ title: 'T', confirmLabel: 'Yes' });
    q.resolve(q.current()!.id, 'confirm');
    await expect(p).resolves.toBe(true);
    const p2 = api.confirm({ title: 'T', confirmLabel: 'Yes' });
    q.dismiss(q.current()!.id);
    await expect(p2).resolves.toBe(false);
  });

  it('show returns the key for a plain action', async () => {
    const { q, api } = setup();
    const p = api.show({ actions: [{ key: 'a', label: 'A' }] });
    q.resolve(q.current()!.id, 'a');
    await expect(p).resolves.toBe('a');
  });

  it('show confirms a destructive action and returns null when cancelled', async () => {
    const { q, api } = setup();
    const p = api.show({
      actions: [{ key: 'del', label: 'Delete', destructive: true, confirm: { title: 'Delete it?', confirmLabel: 'Delete' } }],
    });
    q.resolve(q.current()!.id, 'del');
    await Promise.resolve();
    expect(q.current()!.payload).toEqual({
      kind: 'confirm',
      options: { title: 'Delete it?', confirmLabel: 'Delete', destructive: true },
    });
    q.dismiss(q.current()!.id);
    await expect(p).resolves.toBeNull();
  });

  it('show returns the key when the destructive confirm is accepted', async () => {
    const { q, api } = setup();
    const p = api.show({ actions: [{ key: 'del', label: 'Delete', destructive: true }] });
    q.resolve(q.current()!.id, 'del');
    await Promise.resolve();
    q.resolve(q.current()!.id, 'confirm');
    await expect(p).resolves.toBe('del');
  });

  it('a new request while the destructive confirm is pending resolves the superseded show() to null', async () => {
    const { q, api } = setup();
    const p = api.show({ actions: [{ key: 'del', label: 'Delete', destructive: true }] });
    q.resolve(q.current()!.id, 'del');
    await Promise.resolve();
    await Promise.resolve();
    expect(q.current()!.payload.kind).toBe('confirm');
    const p2 = api.confirm({ title: 'Other', confirmLabel: 'Ok' });
    await expect(p).resolves.toBe(null);
    q.resolve(q.current()!.id, 'confirm');
    await expect(p2).resolves.toBe(true);
  });

  it('resolution waits for waitClosed', async () => {
    const { waitClosed, resolve } = deferredWaitClosed();
    const { q, api } = setup(waitClosed);
    const p = api.confirm({ title: 'T', confirmLabel: 'Yes' });
    q.resolve(q.current()!.id, 'confirm');

    // The row has been picked, but the host Modal has not reported itself
    // dismissed yet — the promise must not settle until it does.
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    resolve();
    await expect(p).resolves.toBe(true);
    expect(settled).toBe(true);
  });

  it('a non-destructive action with confirm phrasing asks first', async () => {
    const { q, api } = setup();
    const p = api.show({
      actions: [
        {
          key: 'assign',
          label: 'Assign',
          confirm: { title: 'Assign Ana to this slot?', confirmLabel: 'Assign' },
        },
      ],
    });
    q.resolve(q.current()!.id, 'assign');
    await Promise.resolve();
    expect(q.current()!.payload).toEqual({
      kind: 'confirm',
      options: { title: 'Assign Ana to this slot?', confirmLabel: 'Assign', destructive: false },
    });
    q.dismiss(q.current()!.id);
    await expect(p).resolves.toBeNull();
  });

  it('a leading node passes through the action untouched', async () => {
    const { q, api } = setup();
    // A stand-in for a component reference, e.g. `<Avatar .../>` — only its
    // referential passthrough is under test here, not actual rendering.
    const leading = { type: 'Avatar' } as unknown as ReactNode;
    const p = api.show({ actions: [{ key: 'a', label: 'A', leading }] });
    expect(q.current()!.payload).toEqual({
      kind: 'actions',
      options: { actions: [{ key: 'a', label: 'A', leading }] },
    });
    q.resolve(q.current()!.id, 'a');
    await expect(p).resolves.toBe('a');
  });
});
