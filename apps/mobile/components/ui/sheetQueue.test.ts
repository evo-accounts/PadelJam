import { describe, expect, it } from 'vitest';
import { SheetQueue } from './sheetQueue';

describe('SheetQueue', () => {
  it('opens a request and resolves it with the chosen value', async () => {
    const q = new SheetQueue<string>();
    const seen: Array<{ id: number; payload: string } | null> = [];
    q.subscribe((r) => seen.push(r));
    const p = q.open('confirm?');
    expect(seen.at(-1)).toEqual({ id: 1, payload: 'confirm?' });
    q.resolve(1, 'yes');
    await expect(p).resolves.toBe('yes');
    expect(seen.at(-1)).toBeNull();
  });

  it('dismisses the open request when a new one arrives', async () => {
    const q = new SheetQueue<string>();
    const first = q.open('a');
    const second = q.open('b');
    await expect(first).resolves.toBeNull();
    q.resolve(2, 'picked');
    await expect(second).resolves.toBe('picked');
  });

  it('ignores a resolution for a request that is no longer open', async () => {
    const q = new SheetQueue<string>();
    const p = q.open('a');
    q.resolve(1, 'x');
    q.resolve(1, 'y'); // stale, must not throw or change anything
    await expect(p).resolves.toBe('x');
    expect(q.current()).toBeNull();
  });

  it('dismiss resolves with null', async () => {
    const q = new SheetQueue<string>();
    const p = q.open('a');
    q.dismiss(1);
    await expect(p).resolves.toBeNull();
  });

  it('a synchronous reopen in the resolve continuation is one notification, never null', async () => {
    const q = new SheetQueue<string, string>();
    const seen: (string | null)[] = [];
    q.subscribe(() => seen.push(q.current()?.payload ?? null));
    const flow = q.open('action').then(() => q.open('confirm'));
    q.resolve(q.current()!.id, 'del');
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).not.toContain(null);
    expect(q.current()?.payload).toBe('confirm');
    q.resolve(q.current()!.id, 'confirm');
    await expect(flow).resolves.toBe('confirm');
  });

  it('a plain dismiss still notifies with null', async () => {
    const q = new SheetQueue<string, string>();
    const seen: (string | null)[] = [];
    q.subscribe(() => seen.push(q.current()?.payload ?? null));
    const p = q.open('a');
    q.dismiss(q.current()!.id);
    await Promise.resolve();
    expect(seen).toContain(null);
    await expect(p).resolves.toBeNull();
  });
});
