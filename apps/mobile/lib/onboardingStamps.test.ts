import { describe, expect, it, vi } from 'vitest';
import type { TypedClient } from '@padel/auth';

import { markNotificationsPrompted, markOnboarded, onStampFailure, stampWithRetry } from './onboardingStamps';

function fakeDb(rpcError: { code: string } | null) {
  const from = vi.fn();
  const rpc = vi.fn(async () => ({ data: rpcError ? null : '2026-09-28T12:00:00Z', error: rpcError }));
  return { db: { rpc, from } as unknown as TypedClient, rpc, from };
}

describe('onboarding stamps (migration 0120)', () => {
  it('stamps through the server RPC and never writes the column itself', async () => {
    const f = fakeDb(null);
    expect(await markOnboarded(f.db)).toEqual({ error: null });
    expect(f.rpc).toHaveBeenCalledWith('mark_onboarded');
    expect(f.from).not.toHaveBeenCalled();

    const g = fakeDb(null);
    await markNotificationsPrompted(g.db);
    expect(g.rpc).toHaveBeenCalledWith('mark_notifications_prompted');
    expect(g.from).not.toHaveBeenCalled();
  });

  it('surfaces an RPC error (including a missing function) without writing the column', async () => {
    const missing = { code: 'PGRST202' };
    const m = fakeDb(missing);
    expect(await markOnboarded(m.db)).toEqual({ error: missing });
    expect(m.from).not.toHaveBeenCalled();

    const err = { code: '42501' };
    const f = fakeDb(err);
    expect(await markNotificationsPrompted(f.db)).toEqual({ error: err });
    expect(f.from).not.toHaveBeenCalled();
  });
});

describe('stampWithRetry', () => {
  const session = (id: string | null) =>
    ({ auth: { getSession: vi.fn(async () => ({ data: { session: id ? { user: { id } } : null } })) } }) as unknown as TypedClient;

  it('succeeds on the first try without retrying', async () => {
    const mark = vi.fn(async () => ({ error: null }));
    expect(await stampWithRetry(session('u1'), mark)).toBe(true);
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith(expect.anything());
  });

  it('retries once, and reports the second result', async () => {
    const mark = vi.fn().mockResolvedValueOnce({ error: { code: '08000' } }).mockResolvedValueOnce({ error: null });
    expect(await stampWithRetry(session('u1'), mark)).toBe(true);
    expect(mark).toHaveBeenCalledTimes(2);
  });

  it('reports failure after two failed attempts, including a thrown network error', async () => {
    const mark = vi.fn().mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValueOnce({ error: { code: '08000' } });
    expect(await stampWithRetry(session('u1'), mark)).toBe(false);
    expect(mark).toHaveBeenCalledTimes(2);
  });

  it('reports failure without a session', async () => {
    const mark = vi.fn();
    expect(await stampWithRetry(session(null), mark)).toBe(false);
    expect(mark).not.toHaveBeenCalled();
  });
});

describe('onStampFailure: surface the first failure, never strand the user', () => {
  it('stays on the step the first time, lets them through the second', () => {
    expect(onStampFailure(1)).toBe('stay');
    expect(onStampFailure(2)).toBe('continue');
    expect(onStampFailure(3)).toBe('continue');
  });
});
