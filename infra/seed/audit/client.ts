// infra/seed/audit/client.ts
// REST helpers. Every write goes through PostgREST/GoTrue exactly like the app; the service
// role is used only where the app has no path (admin users, storage, direct inserts, patches).
import type { Env } from './env.ts';

export type Client = ReturnType<typeof makeClient>;

export function makeClient(env: Env) {
  async function req<T = unknown>(
    path: string,
    { method = 'GET', jwt, body, prefer, headers = {}, raw }: {
      method?: string; jwt?: string; body?: unknown; prefer?: string; headers?: Record<string, string>; raw?: BodyInit;
    } = {},
  ): Promise<T> {
    const h: Record<string, string> = {
      apikey: env.service, Authorization: `Bearer ${jwt ?? env.service}`, ...headers,
    };
    if (!raw) h['Content-Type'] = 'application/json';
    if (prefer) h.Prefer = prefer;
    const res = await fetch(`${env.url}${path}`, { method, headers: h, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
    return data as T;
  }

  // RPCs run as the user with the anon apikey, exactly like the app's traffic.
  const rpc = <T = unknown>(jwt: string, name: string, args: Record<string, unknown> = {}) =>
    req<T>(`/rest/v1/rpc/${name}`, { method: 'POST', jwt, body: args, headers: { apikey: env.anon } });
  const insert = <T = Record<string, unknown>[]>(table: string, rows: unknown) =>
    req<T>(`/rest/v1/${table}`, { method: 'POST', body: rows, prefer: 'return=representation' });
  const sel = <T = Record<string, unknown>[]>(table: string, qs: string) => req<T>(`/rest/v1/${table}?${qs}`);
  const patch = (table: string, qs: string, fields: unknown) =>
    req(`/rest/v1/${table}?${qs}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
  const del = (table: string, qs: string) => req(`/rest/v1/${table}?${qs}`, { method: 'DELETE' });

  async function adminCreateUser(email: string, phone: string, password: string): Promise<string> {
    const u = await req<{ id: string }>('/auth/v1/admin/users', {
      method: 'POST', body: { email, phone, password, email_confirm: true, phone_confirm: true },
    });
    return u.id;
  }
  const adminDeleteUser = (id: string) => req(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  async function adminFindUserByEmail(email: string): Promise<string | null> {
    const rows = await sel<{ id: string }[]>('profiles', `email=eq.${encodeURIComponent(email)}&select=id`);
    if (rows.length) return rows[0].id;
    // A half-created account (auth user, no profile) still has to be purged.
    // One page is enough for this project (31 cast accounts plus a handful of real users); a full page
    // means the assumption broke, so fail loudly rather than return a false null (which would leave an
    // orphan auth user and make the next adminCreateUser fail on the duplicate email).
    const page = await req<{ users: { id: string; email?: string }[] }>(`/auth/v1/admin/users?page=1&per_page=1000`);
    if (page.users.length >= 1000) throw new Error('adminFindUserByEmail: more than 1000 auth users; add pagination');
    return page.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
  }
  async function signIn(email: string, password: string): Promise<string> {
    const r = await req<{ access_token: string }>('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email, password }, headers: { apikey: env.anon }, jwt: env.anon,
    });
    return r.access_token;
  }
  const invokeFn = <T = unknown>(name: string, jwt: string, body: unknown = {}) =>
    req<T>(`/functions/v1/${name}`, { method: 'POST', jwt, body, headers: { apikey: env.anon } });
  const uploadObject = (bucket: string, path: string, bytes: Uint8Array, contentType: string) =>
    req(`/storage/v1/object/${bucket}/${path}`, {
      method: 'POST', raw: bytes, headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
    });
  async function count(table: string, qs = ''): Promise<number> {
    const r = await fetch(`${env.url}/rest/v1/${table}?select=*${qs ? '&' + qs : ''}`, {
      headers: { apikey: env.service, Authorization: `Bearer ${env.service}`, Prefer: 'count=exact', Range: '0-0' },
    });
    return Number((r.headers.get('content-range') || '/0').split('/')[1]);
  }

  return { env, req, rpc, insert, sel, patch, del, adminCreateUser, adminDeleteUser, adminFindUserByEmail, signIn, invokeFn, uploadObject, count };
}
