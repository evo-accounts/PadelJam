/**
 * Which edge functions the browser calls, and does a deployed one answer the browser's CORS
 * preflight? Two checks guard the same thing at two different layers:
 *
 *   - infra/supabase/functions/_shared/cors.test.ts: the SOURCE of every browser-called function
 *     wraps its handler in withCors (`pnpm test:functions`);
 *   - scripts/check-remote-schema.mjs, through this module: the DEPLOYED function answers the
 *     preflight (`pnpm schema:check`, which CI runs against the hosted project).
 *
 * cors.test.ts still carries its own copy of the scan below. Switching it to import this module
 * means editing a file under infra/**, which queues the 80-minute mobile E2E (and wipes the local
 * database) for a test-only change, so fold it in the next time infra/supabase/functions changes
 * anyway. Until then the "finds today's callers" test here holds both copies to the same set.
 *
 * The second check exists because the first cannot see a deploy. Functions reach the hosted
 * project as pasted dashboard builds (see build-dashboard-function.mjs), so an old build pasted
 * over a new one, or a new function never pasted at all, puts back the 405 that broke web blasts,
 * chat, account completion and account deletion until 2026-10-07 (#285). The local stack cannot
 * catch it either: its gateway answers OPTIONS itself.
 *
 * The callers are found, not listed, so a new web caller is covered the day it lands: code that
 * runs in the browser is apps/web/src plus every packages/<pkg>/src (packages/api's
 * functions.invoke runs on web as well as mobile).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The request headers a browser call to a function carries, lower-cased: supabase-js's
 * functions.invoke sends Authorization + apikey (its fetch wrapper), X-Client-Info (its default
 * headers) and Content-Type (a JSON body); apps/web's plain fetch calls send Authorization and
 * Content-Type. The preflight asks for exactly these, so the function must allow each one.
 */
export const BROWSER_REQUEST_HEADERS = ['authorization', 'x-client-info', 'apikey', 'content-type'];

const INVOKE = /functions\.invoke\b[^(]*\(\s*['"`]([\w-]+)['"`]/g;
const FETCH_PATH = /\/functions\/v1\/([\w-]+)/g;

function sourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    if (name === 'node_modules') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * @param {string} root  the repo root
 * @returns {Map<string, string>} function name → the first file (repo-relative) that calls it,
 *   sorted by function name
 */
export function browserCalledFunctions(root) {
  const dirs = [
    join(root, 'apps', 'web', 'src'),
    ...readdirSync(join(root, 'packages')).map((p) => join(root, 'packages', p, 'src')),
  ];
  const found = new Map();
  for (const file of dirs.flatMap(sourceFiles)) {
    const text = readFileSync(file, 'utf8');
    for (const m of [...text.matchAll(INVOKE), ...text.matchAll(FETCH_PATH)]) {
      if (!found.has(m[1])) found.set(m[1], file.slice(root.length + 1));
    }
  }
  return new Map([...found].sort(([a], [b]) => a.localeCompare(b)));
}

const list = (value) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/**
 * Judges a deployed function's answer to a preflight for a POST carrying BROWSER_REQUEST_HEADERS.
 *
 * @param {{ status: number, headers: { get(name: string): string | null } }} res
 * @param {string} requestOrigin  the Origin the preflight was sent with
 * @returns {{ result: 'ok' | 'fail' | 'skip', reason: string }} 'skip' means not verified: a 5xx
 *   is the platform or the function's boot, not proof either way about CORS.
 */
export function classifyPreflight(res, requestOrigin) {
  if (res.status === 404) return { result: 'fail', reason: 'not deployed (404)' };
  if (res.status >= 500) return { result: 'skip', reason: `HTTP ${res.status}` };
  if (res.status < 200 || res.status > 299) {
    return { result: 'fail', reason: `the preflight gets HTTP ${res.status}` };
  }
  const origin = res.headers.get('access-control-allow-origin')?.trim();
  if (!origin) return { result: 'fail', reason: 'no Access-Control-Allow-Origin' };
  if (origin !== '*' && origin !== requestOrigin) {
    return {
      result: 'fail',
      reason: `Access-Control-Allow-Origin is ${origin}, not * or ${requestOrigin}`,
    };
  }
  const allowed = list(res.headers.get('access-control-allow-headers'));
  const missing = allowed.includes('*')
    ? []
    : BROWSER_REQUEST_HEADERS.filter((h) => !allowed.includes(h));
  if (missing.length) {
    return { result: 'fail', reason: `Access-Control-Allow-Headers lacks ${missing.join(', ')}` };
  }
  const methods = list(res.headers.get('access-control-allow-methods'));
  if (!methods.includes('*') && !methods.includes('post')) {
    return { result: 'fail', reason: 'Access-Control-Allow-Methods lacks POST' };
  }
  return { result: 'ok', reason: '' };
}
