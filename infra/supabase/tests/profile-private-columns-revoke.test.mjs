// infra/supabase/tests/profile-private-columns-revoke.test.mjs
//
// Migration 0158 (PAD-133, PR 2): nobody selects date_of_birth, gender or location_point from
// `profiles` through the Data API, not even their own row (column privileges are per role). Own values
// come from get_my_private_profile; writes keep working. Every call uses a real JWT, never the service key.
import { user, rpc, req, sel, patch, ANON, BASE_URL, assert, expectError, run } from './lib.mjs';

const [alice, bob] = await Promise.all([user('pcr-a', { gender: 'female' }), user('pcr-b', { gender: 'male' })]);
await patch('profiles', `id=eq.${alice.id}`, { date_of_birth: '1990-05-17' });
await patch('profiles', `id=eq.${bob.id}`, { date_of_birth: '1985-01-02' });
await rpc(bob.jwt, 'set_my_location', { p_lat: 38.72, p_lng: -9.14, p_text: 'Lisbon' });

const asUser = (u, qs) => req(`/rest/v1/profiles?${qs}`, { jwt: u.jwt });
const COLS = ['date_of_birth', 'gender', 'location_point'];

await run("another user's row: each column is refused as a select and as a filter", async () => {
  for (const c of COLS) {
    await expectError(() => asUser(alice, `id=eq.${bob.id}&select=${c}`), '42501');
    await expectError(() => asUser(alice, `${c}=not.is.null&select=id`), '42501');
  }
});

await run('your own row is refused too: nobody reads them directly', async () => {
  for (const c of COLS) {
    await expectError(() => asUser(alice, `id=eq.${alice.id}&select=${c}`), '42501');
    await expectError(() => asUser(alice, `id=eq.${alice.id}&${c}=not.is.null&select=id`), '42501');
  }
});

await run('anon cannot read them either', async () => {
  for (const c of COLS) {
    const res = await fetch(`${BASE_URL}/rest/v1/profiles?select=${c}`, { headers: { apikey: ANON } });
    assert(!res.ok, `anon ${c} → ${res.status}`);
  }
});

await run('the readable columns still work, and get_my_private_profile answers for the caller', async () => {
  const rows = await asUser(alice, `id=eq.${bob.id}&select=id,full_name,avatar_url,level,location_text`);
  assert(rows.length === 1 && rows[0].id === bob.id, 'public columns readable');
  const [a] = await rpc(alice.jwt, 'get_my_private_profile');
  assert(a.date_of_birth === '1990-05-17' && a.gender === 'female', `own values, got ${JSON.stringify(a)}`);
});

await run('updating your own date of birth and gender still works', async () => {
  await req(`/rest/v1/profiles?id=eq.${alice.id}`, {
    method: 'PATCH', jwt: alice.jwt, body: { date_of_birth: '1991-02-03', gender: 'male' }, prefer: 'return=minimal',
  });
  const [a] = await rpc(alice.jwt, 'get_my_private_profile');
  assert(a.date_of_birth === '1991-02-03' && a.gender === 'male', `written, got ${JSON.stringify(a)}`);
  const [stored] = await sel('profiles', `id=eq.${alice.id}&select=date_of_birth,gender`);
  assert(stored.date_of_birth === '1991-02-03' && stored.gender === 'male', 'stored');
});
