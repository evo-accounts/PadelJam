// infra/supabase/tests/lib.mjs
// Minimal REST harness for RPC-level tests against the LOCAL stack.
// Usage: import { rpc, anonRpc, sel, insert, patch, del, user, expectError, assert, run, adminCreateUser, signIn } from './lib.mjs'
// Leaves its test users/communities in the local DB (cleaned by the next db reset).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* rely on process.env */ }
  return env;
}
const ENV = loadEnv();
export const BASE_URL = ENV.SUPABASE_URL || 'http://127.0.0.1:55321';
export const SERVICE = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(BASE_URL)) {
  console.error(`Refusing non-local URL ${BASE_URL}`); process.exit(1);
}

export async function req(path, { method = 'GET', jwt, body, prefer } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: SERVICE, Authorization: `Bearer ${jwt || SERVICE}` };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return data;
}
export const rpc = (jwt, name, args = {}) => req(`/rest/v1/rpc/${name}`, { method: 'POST', jwt, body: args });

/** Call an RPC as ANON (no session). The service key bypasses grants, so it can neither prove a
 *  function is closed to anon nor that a pre-auth one is open to it. */
export const ANON = ENV.SUPABASE_ANON_KEY;
export async function anonRpc(name, args = {}) {
  if (!ANON) throw new Error('Missing SUPABASE_ANON_KEY');
  const res = await fetch(`${BASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`anon POST /rest/v1/rpc/${name} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
export const insert = (table, rows) => req(`/rest/v1/${table}`, { method: 'POST', body: rows, prefer: 'return=representation' });
export const sel = (table, qs) => req(`/rest/v1/${table}?${qs}`);
export const patch = (table, qs, fields) => req(`/rest/v1/${table}?${qs}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
export const del = (table, qs) => req(`/rest/v1/${table}?${qs}`, { method: 'DELETE' });

export async function adminCreateUser(email, phone, password) {
  const u = await req('/auth/v1/admin/users', {
    method: 'POST', body: { email, phone, email_confirm: true, phone_confirm: true },
  });
  // Two calls on purpose. A one-step create-with-password is an INSERT, and 0101's
  // trg_record_password_set is deliberately AFTER UPDATE — the INSERT that creates an OTP user
  // writes a bcrypt placeholder into encrypted_password, so firing on it would recreate the very
  // bug 0101 removed. A persona born with a password would therefore never be recorded and would
  // report has_password: false. No real user is made that way: there is no signUp anywhere in
  // apps/ or packages/, every password lands on an account that already exists (auth.updateUser,
  // or the admin UPDATE in complete-account). Fixtures acquire theirs the same way.
  if (password != null) await req(`/auth/v1/admin/users/${u.id}`, { method: 'PUT', body: { password } });
  return u.id;
}
export async function signIn(email, password) {
  const r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  return r.access_token;
}

/** Create a fully onboarded user and return { id, jwt }. `tag` makes emails unique per run. */
export async function user(tag, { gender = 'male', name } = {}) {
  const run = process.env.TEST_RUN || Date.now().toString(36);
  const email = `${tag}-${run}@rpctest.local`;
  const phone = '+3519' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const id = await adminCreateUser(email, phone, 'Padel1234#');
  await insert('profiles', {
    id, email, phone, full_name: name ?? `${tag} ${run}`, locale: 'en', onboarded_at: new Date().toISOString(),
    gender, dominant_hand: 'right', court_side: 'left', preferred_time: 'any', location_text: 'Lisbon, PT',
  });
  return { id, jwt: await signIn(email, 'Padel1234#') };
}

/** Await `fn` and assert it throws with a message containing `code`. */
export async function expectError(fn, code) {
  try { await fn(); } catch (e) {
    if (String(e.message).includes(code)) return;
    throw new Error(`expected error containing "${code}", got: ${e.message}`);
  }
  throw new Error(`expected error containing "${code}", but the call succeeded`);
}

export function assert(cond, msg) { if (!cond) throw new Error(`assertion failed: ${msg}`); }

export async function run(name, fn) {
  console.log(`▶ ${name}`);
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.error(`✘ ${name}\n  ${e.message}`); process.exit(1); }
}
