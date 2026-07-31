import { CONFIG } from './config';
import { run } from './proc';

/**
 * Kong's access log for the window around a failure.
 *
 * This exists because of what the app-side log does NOT contain. `appLogTail`
 * gives 30s of on-device os_log, where CFNetwork records a status code and a
 * byte count but NO URL — so a 401 on one request and a 500 on an unrelated one
 * three seconds later are indistinguishable. That ambiguity caused three
 * separate misdiagnoses of the same intermittent auth failure, including reading
 * a `PGRST303` rejection as an HTTP 500.
 *
 * The gateway log has method, path, status and body size per request, which
 * settles those questions in one read. A 79-byte 401 on /rest/v1, for instance,
 * is exactly PostgREST's `{"code":"PGRST303",...,"message":"JWT issued at future"}`.
 */
const GATEWAY_CONTAINER = process.env.E2E_GATEWAY_CONTAINER ?? 'supabase_kong_padeljam';

export async function gatewayLogTail(seconds = 120): Promise<string> {
  const res = await run(
    'docker',
    ['logs', '--timestamps', '--since', `${seconds}s`, GATEWAY_CONTAINER],
    { timeoutMs: 10_000 },
  );
  // Kong writes access lines to stderr; keep only API traffic so the artifact is
  // readable, and drop the harness's own service-role calls, which use a
  // non-JWT key and so can never produce the auth failures this is here for.
  return `${res.stdout}\n${res.stderr}`
    .split('\n')
    .filter((l) => l.includes('/rest/v1') || l.includes('/auth/v1'))
    .filter((l) => !l.includes('"node"'))
    .slice(-400)
    .join('\n');
}

/**
 * Count PostgREST stale-clock rejections in a window.
 *
 * These are ABSORBED by the retry in @padel/db, so they are not failures — but
 * the rate is worth watching: it is the visible symptom of an idle PostgREST,
 * and a jump would mean the condition got worse rather than that the retry
 * stopped working.
 */
export async function countJwtClockRejections(seconds = 3600): Promise<number> {
  const log = await gatewayLogTail(seconds);
  return log.split('\n').filter((l) => /" 401 79 /.test(l)).length;
}

export const gatewayContainer = GATEWAY_CONTAINER;
export const supabaseUrl = CONFIG.supabaseUrl;
