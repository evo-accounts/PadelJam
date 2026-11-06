// infra/supabase/tests/default-table-privileges.test.mjs
// Migration 0155: new tables and sequences in public are closed by default, and anon holds no write
// grant on any table. This file is also the guard for every future migration: it reads the catalog
// through _audit_public_table_grants (the suite has no database connection, only PostgREST).
import { BASE_URL, ANON, user, rpc, anonRpc, req, expectError, assert, run } from './lib.mjs';

const DENIED = 'permission denied for function';
const IMPOSSIBLE = '00000000-0000-0000-0000-000000000000';

async function audit() {
  return req('/rest/v1/rpc/_audit_public_table_grants', { method: 'POST', body: {} });
}

/** A raw request as anon: lib's helpers all use the service key, which bypasses grants. */
async function asAnon(method, path, body) {
  const res = await fetch(`${BASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, text };
}

await run('catalog: every table in public has RLS on and no anon write grant', async () => {
  const { tables } = await audit();
  assert(tables.length > 40, `audit lists the tables (got ${tables.length})`);
  const noRls = tables.filter((t) => !t.rls_on).map((t) => t.table);
  const anonWrites = tables.filter((t) => t.anon_writes).map((t) => t.table);
  assert(noRls.length === 0,
    `tables without row level security: ${noRls.join(', ')}. Add \`alter table <t> enable row level security;\` in the migration that creates them.`);
  assert(anonWrites.length === 0,
    `tables where anon can insert, update or delete: ${anonWrites.join(', ')}. Since 0155 a new table has no grants; ` +
    'remove the `grant ... to anon` (or `grant all`) from the migration that creates them, or `revoke insert, update, delete ... from anon`.');
});

await run('catalog: the default ACL for new tables and sequences names no anon or authenticated', async () => {
  const { default_acl: acl } = await audit();
  assert(acl.length === 0,
    `postgres's default ACL in public grants to ${acl.map((a) => `${a.grantee}:${a.privilege} on ${a.kind}`).join(', ')}. ` +
    'A migration re-opened the default; grant explicitly on each new table instead.');
});

await run('_audit_public_table_grants is closed to anon and signed-in users', async () => {
  await expectError(() => anonRpc('_audit_public_table_grants'), DENIED);
  const u = await user('dtp');
  await expectError(() => rpc(u.jwt, '_audit_public_table_grants'), DENIED);
});

await run('anon cannot POST, PATCH or DELETE on tables that used to be open', async () => {
  const targets = [
    ['user_settings', 'user_id', { user_id: IMPOSSIBLE }, { notifications_push: false }],
    ['notifications', 'id', { id: IMPOSSIBLE }, { read_at: new Date().toISOString() }],
    ['reports', 'id', { id: IMPOSSIBLE }, { reason: 'x' }],
    ['event_participants', 'id', { id: IMPOSSIBLE }, { has_paid: true }],
  ];
  for (const [table, col, row, change] of targets) {
    for (const [method, path, body] of [
      ['POST', table, row],
      ['PATCH', `${table}?${col}=eq.${IMPOSSIBLE}`, change],
      ['DELETE', `${table}?${col}=eq.${IMPOSSIBLE}`, undefined],
    ]) {
      const r = await asAnon(method, path, body);
      assert(r.json?.code === '42501' && /permission denied for table/.test(r.json?.message ?? ''),
        `anon ${method} ${table}: expected 42501 permission denied for table, got ${r.status} ${r.text.slice(0, 200)}`);
    }
  }
});

await run('signed-in writes the app makes still work', async () => {
  const u = await user('dtp-write');
  const mine = (t, col) => `${t}?${col}=eq.${u.id}`;
  // Zero rows is fine here (not every user has a settings row yet); what matters is no 42501.
  const sres = await fetch(`${BASE_URL}/rest/v1/${mine('user_settings', 'user_id')}`, {
    method: 'PATCH',
    headers: { apikey: ANON, Authorization: `Bearer ${u.jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ notifications_push: false }),
  });
  assert(sres.ok, `update own user_settings: ${sres.status} ${await sres.text()}`);
  // authenticated holds column-level grants on profiles (0120), so ask for no representation back.
  const res = await fetch(`${BASE_URL}/rest/v1/${mine('profiles', 'id')}`, {
    method: 'PATCH',
    headers: { apikey: ANON, Authorization: `Bearer ${u.jwt}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ full_name: 'Renamed Player' }),
  });
  assert(res.ok, `update own profiles.full_name: ${res.status} ${await res.text()}`);
  const [row] = await req(`/rest/v1/profiles?id=eq.${u.id}&select=full_name`);
  assert(row?.full_name === 'Renamed Player', `profiles.full_name changed (got ${JSON.stringify(row)})`);
});
