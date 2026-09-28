import { describe, expect, it, vi } from 'vitest';
import type { TypedClient } from '@padel/auth';

import { markNotificationsPrompted, markOnboarded } from './onboardingStamps';

function fakeDb(rpcError: { code: string } | null) {
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const rpc = vi.fn(async () => ({ data: rpcError ? null : '2026-09-28T12:00:00Z', error: rpcError }));
  return { db: { rpc, from } as unknown as TypedClient, rpc, from, update, eq };
}

describe('onboarding stamps (migration 0120)', () => {
  it('stamps through the server RPC and never writes the column itself', async () => {
    const f = fakeDb(null);
    expect(await markOnboarded(f.db, 'u1')).toEqual({ error: null });
    expect(f.rpc).toHaveBeenCalledWith('mark_onboarded');
    expect(f.from).not.toHaveBeenCalled();

    const g = fakeDb(null);
    await markNotificationsPrompted(g.db, 'u1');
    expect(g.rpc).toHaveBeenCalledWith('mark_notifications_prompted');
    expect(g.from).not.toHaveBeenCalled();
  });

  it('falls back to the direct write only while the RPC does not exist yet (PGRST202)', async () => {
    const f = fakeDb({ code: 'PGRST202' });
    expect(await markOnboarded(f.db, 'u1')).toEqual({ error: null });
    expect(f.from).toHaveBeenCalledWith('profiles');
    expect(f.update).toHaveBeenCalledWith({ onboarded_at: expect.any(String) });
    expect(f.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('surfaces any other RPC error without a fallback write', async () => {
    const err = { code: '42501' };
    const f = fakeDb(err);
    expect(await markNotificationsPrompted(f.db, 'u1')).toEqual({ error: err });
    expect(f.from).not.toHaveBeenCalled();
  });
});
