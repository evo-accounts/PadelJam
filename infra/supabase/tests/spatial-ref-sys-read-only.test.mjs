// infra/supabase/tests/spatial-ref-sys-read-only.test.mjs
// spatial_ref_sys (migration 0133): PostGIS's SRID registry is read-only for every role a request
// can arrive as. Before 0133, anon held DELETE on it with RLS off, so the publishable key could
// empty it and every geography distance in the app would fail with "Cannot find SRID 4326".
//
// Every write below names a srid that cannot exist (the table's own check constraint keeps srid
// above 0): updates and deletes filter on it, inserts try to create it. So even if the trigger were
// missing, nothing would change — the filter matches no row, and the insert dies on the constraint.
// The trigger is statement-level and BEFORE, so it refuses each statement before either happens.
import { user, req, expectError, assert, run, BASE_URL, ANON } from './lib.mjs';

const NONE = 'srid=eq.-1';
const REFUSED = 'read-only through the API';

/** A raw request as anon: lib's `req` always sends the service key. */
async function anon(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { apikey: ANON, 'Content-Type': 'application/json', ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ok: res.ok, body: await res.json().catch(() => null) };
}

await run('anon cannot delete, rewrite, insert or upsert SRIDs', async () => {
  const IMPOSSIBLE = { srid: -1, auth_name: 'x' };
  for (const [method, query, body, headers] of [
    ['DELETE', `?${NONE}`, undefined, {}],
    ['PATCH', `?${NONE}`, { auth_name: 'x' }, {}],
    ['POST', '', IMPOSSIBLE, {}],
    ['POST', '', IMPOSSIBLE, { Prefer: 'resolution=merge-duplicates' }],
  ]) {
    const r = await anon(method, `/rest/v1/spatial_ref_sys${query}`, body, headers);
    assert(!r.ok, `anon ${method} must be refused, got HTTP ${r.status}`);
    assert(r.body?.code === '42501', `anon ${method}: 42501, got ${JSON.stringify(r.body)}`);
    assert(
      String(r.body?.message).includes(REFUSED),
      `anon ${method}: the trigger refused it, got ${r.body?.message}`,
    );
  }
});

await run('a signed-in user cannot either', async () => {
  const u = await user('srs');
  await expectError(
    () => req(`/rest/v1/spatial_ref_sys?${NONE}`, { method: 'DELETE', jwt: u.jwt }),
    REFUSED,
  );
  await expectError(
    () =>
      req(`/rest/v1/spatial_ref_sys?${NONE}`, {
        method: 'PATCH',
        jwt: u.jwt,
        body: { auth_name: 'x' },
      }),
    REFUSED,
  );
});

await run('nor the service key', async () => {
  // lib's req sends the service key when no jwt is given. Nothing writes this table through the API.
  await expectError(() => req(`/rest/v1/spatial_ref_sys?${NONE}`, { method: 'DELETE' }), REFUSED);
});

await run('reading is untouched — PostGIS looks SRIDs up as the calling role', async () => {
  const r = await anon('GET', '/rest/v1/spatial_ref_sys?select=srid,auth_name&srid=eq.4326');
  assert(r.ok, `anon can still read the registry, got HTTP ${r.status}`);
  assert(
    r.body?.length === 1 && r.body[0].auth_name === 'EPSG',
    `SRID 4326 is there, got ${JSON.stringify(r.body)}`,
  );
});
