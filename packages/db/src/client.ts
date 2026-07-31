import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type TypedClient = SupabaseClient<Database>;

/** Delay before the single retry, so the refreshed clock is in play. */
const JWT_CLOCK_RETRY_DELAY_MS = 300;

/**
 * Retry exactly once when PostgREST rejects a token as `PGRST303 JWT issued at
 * future`.
 *
 * PostgREST validates `iat` against a CACHED clock. After a quiet period that
 * cache can sit tens of seconds behind real time, so a token minted moments ago
 * looks future-dated and comes back 401 — with nothing wrong with the token,
 * the signature, or the session. PostgREST allows 30s of skew and exposes no
 * knob to widen it (v14.15's entire JWT surface is jwt-aud,
 * jwt-cache-max-entries, jwt-role-claim-key, jwt-secret, jwt-secret-is-base64).
 *
 * The condition is SELF-HEALING: serving a request refreshes the clock, so the
 * next one succeeds. Measured against the local stack — after 300s idle, 1
 * request in 24 was rejected and every other concurrent one passed; and across
 * four days of gateway logs, each of the 84 rejections is followed by a 200
 * within 40-300ms. That is the shape a single bounded retry fixes exactly.
 *
 * Not only a test-harness concern: any low-traffic project has an idle
 * PostgREST, so a real user signing in after a quiet period can hit this. Hence
 * the shared client rather than the E2E driver.
 *
 * Deliberately narrow — 401 AND code PGRST303 AND the message. A genuine 401,
 * an expired token or a network error passes straight through. Retrying more
 * broadly would mask real auth failures.
 */
export function withJwtClockRetry(fetchImpl: typeof fetch): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const res = await fetchImpl(input, init);
    if (res.status !== 401) return res;

    // Read the body off a clone, so the original is untouched for the caller in
    // the (usual) case where we decide not to retry.
    let body: { code?: string; message?: string } | null = null;
    try {
      body = (await res.clone().json()) as { code?: string; message?: string };
    } catch {
      return res; // not JSON — not ours
    }
    if (body?.code !== 'PGRST303' || !/issued at future/i.test(body.message ?? '')) return res;

    await new Promise((resolve) => setTimeout(resolve, JWT_CLOCK_RETRY_DELAY_MS));
    return fetchImpl(input, init);
  };
}

export const createClient = (
  url: string,
  key: string,
  options?: Parameters<typeof createSupabaseClient>[2],
): TypedClient =>
  createSupabaseClient<Database>(url, key, {
    ...options,
    global: {
      ...options?.global,
      fetch: withJwtClockRetry(
        options?.global?.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args)),
      ),
    },
  });
