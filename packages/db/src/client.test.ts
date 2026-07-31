import { describe, expect, it, vi } from 'vitest';
import { withJwtClockRetry } from './client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const PGRST303 = { code: 'PGRST303', details: null, hint: null, message: 'JWT issued at future' };

describe('withJwtClockRetry', () => {
  it('retries once on PGRST303 and returns the second response', async () => {
    const inner = vi.fn()
      .mockResolvedValueOnce(json(401, PGRST303))
      .mockResolvedValueOnce(json(200, [{ id: 'a' }]));

    const res = await withJwtClockRetry(inner as unknown as typeof fetch)('http://x/rest/v1/profiles');

    expect(inner).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('retries at most once — a second PGRST303 is returned to the caller', async () => {
    const inner = vi.fn().mockResolvedValue(json(401, PGRST303));

    const res = await withJwtClockRetry(inner as unknown as typeof fetch)('http://x/rest/v1/profiles');

    expect(inner).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(401);
  });

  it('passes the original request through unchanged on retry', async () => {
    const inner = vi.fn()
      .mockResolvedValueOnce(json(401, PGRST303))
      .mockResolvedValueOnce(json(200, []));
    const init = { method: 'POST', body: '{"a":1}', headers: { Authorization: 'Bearer t' } };

    await withJwtClockRetry(inner as unknown as typeof fetch)('http://x/rest/v1/rpc/f', init);

    expect(inner).toHaveBeenNthCalledWith(2, 'http://x/rest/v1/rpc/f', init);
  });

  // The point of the narrow predicate: everything below must NOT be retried,
  // because retrying a real auth failure hides it.
  it.each([
    ['a 401 with a different code', 401, { code: 'PGRST301', message: 'JWT expired' }],
    ['a 401 with no code', 401, { message: 'unauthorized' }],
    ['a 403', 403, { code: 'PGRST303', message: 'JWT issued at future' }],
    ['a 500', 500, { code: 'PGRST303', message: 'JWT issued at future' }],
    ['a 200', 200, [{ id: 'a' }]],
  ])('does not retry %s', async (_label, status, body) => {
    const inner = vi.fn().mockResolvedValue(json(status, body));

    const res = await withJwtClockRetry(inner as unknown as typeof fetch)('http://x/rest/v1/profiles');

    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(status);
  });

  it('does not retry a 401 whose body is not JSON', async () => {
    const inner = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));

    const res = await withJwtClockRetry(inner as unknown as typeof fetch)('http://x/rest/v1/profiles');

    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it('propagates a network error rather than retrying it', async () => {
    const inner = vi.fn().mockRejectedValue(new TypeError('network'));

    await expect(withJwtClockRetry(inner as unknown as typeof fetch)('http://x/')).rejects.toThrow('network');
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('leaves the returned body readable by the caller', async () => {
    // The predicate reads a CLONE; if it consumed the original, callers would
    // get "body already read" on every non-retried 401.
    const inner = vi.fn().mockResolvedValue(json(401, { code: 'PGRST301', message: 'JWT expired' }));

    const res = await withJwtClockRetry(inner as unknown as typeof fetch)('http://x/');

    await expect(res.json()).resolves.toMatchObject({ code: 'PGRST301' });
  });
});
