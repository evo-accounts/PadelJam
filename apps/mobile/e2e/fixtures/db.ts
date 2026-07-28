import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../driver/config';
import { run, runOk } from '../driver/proc';

const ROOT = join(__dirname, '..', '..', '..', '..');

function serviceKey(): string {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/);
      if (m?.[1]) return m[1].replace(/^["']|["']$/g, '');
    }
  } catch { /* fall through */ }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY not found in env or repo-root .env');
}

/** Service-role PostgREST request (bypasses RLS) — for test setup/assertions only. */
export async function rest<T = unknown>(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const key = serviceKey();
  const res = await fetch(`${CONFIG.supabaseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (null as T);
}

export const select = <T = Record<string, unknown>[]>(table: string, qs: string) => rest<T>(`/rest/v1/${table}?${qs}`);
export const rpcAsService = <T = unknown>(name: string, args: Record<string, unknown> = {}) =>
  rest<T>(`/rest/v1/rpc/${name}`, { method: 'POST', body: args });

/** Run SQL inside the local Postgres container. `su` = run as supabase_admin (true superuser). */
export async function psql(sql: string, opts: { su?: boolean } = {}): Promise<string> {
  const user = opts.su ? 'supabase_admin' : 'postgres';
  // supabase_admin authenticates by password (peer auth only covers postgres).
  return runOk('docker', ['exec', '-i', '-e', 'PGPASSWORD=postgres', CONFIG.dbContainer, 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { timeoutMs: 120_000 });
}

export async function dbHealthy(): Promise<boolean> {
  const r = await run('docker', ['exec', CONFIG.dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1']);
  return r.code === 0;
}
