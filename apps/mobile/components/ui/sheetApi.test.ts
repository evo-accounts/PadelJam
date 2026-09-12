import { describe, expect, it } from 'vitest';

import { createSheetApi, type Request } from './sheetApi';
import { SheetQueue } from './sheetQueue';

const setup = () => {
  const q = new SheetQueue<Request, string>();
  return { q, api: createSheetApi(q) };
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
});
