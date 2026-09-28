// infra/supabase/tests/profile-privacy-writes.test.mjs
//
// Migrations 0119 and 0120.
//   0119 — nobody reads anybody's email through the Data API, their own included (it comes from the
//          auth user), mirroring what 0115 did for phone.
//   0120 — a signed-in user writes only the nine columns the app lets them edit; server-controlled
//          columns (identity, contact copies, consent, deletion, onboarding stamps, location) are
//          set by SECURITY DEFINER functions or the service role only.
//
// Every read and write goes through PostgREST with a real user's JWT (or the anon key), never the
// service key: the service role keeps full access by design, so it would make every assertion pass.
import { user, rpc, req, sel, patch, ANON, BASE_URL, assert, expectError, run } from './lib.mjs';

/** The exact column list `useMyProfile` selects (packages/api/src/profile/queries.ts). */
const MY_PROFILE_COLUMNS =
  'id,full_name,avatar_url,description,date_of_birth,gender,dominant_hand,court_side,preferred_time,location_text';

const read = (u, qs) => req(`/rest/v1/profiles?${qs}`, { jwt: u.jwt });
/** A PATCH the way supabase-js sends `.update(input).eq('id', …)`: return=minimal, so a 42501 can
 *  only come from the UPDATE privilege, never from reading the row back. */
const write = (u, id, fields) =>
  req(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', jwt: u.jwt, body: fields, prefer: 'return=minimal' });
const stored = async (id, cols) => (await sel('profiles', `id=eq.${id}&select=${cols}`))[0]; // service key

async function anon(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { apikey: ANON, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`anon ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const [alice, bob] = await Promise.all([user('pw-a'), user('pw-b')]);

// ---------------------------------------------------------------------------------------- 0119 --

await run("another user cannot read your email, by name, through * or by filtering on it", async () => {
  await expectError(() => read(bob, `id=eq.${alice.id}&select=email`), '42501');
  await expectError(() => read(bob, `id=eq.${alice.id}&select=*`), '42501');
  const [stored] = await sel('profiles', `id=eq.${alice.id}&select=email`); // service key
  // A WHERE on a column needs SELECT on it too — otherwise email becomes a "registered?" oracle.
  await expectError(() => read(bob, `email=eq.${encodeURIComponent(stored.email)}&select=id`), '42501');
});

await run('your own email comes from the auth user, not profiles', async () => {
  // Column privileges are per role, not per row: not even your own.
  await expectError(() => read(alice, `id=eq.${alice.id}&select=email`), '42501');

  const [mine] = await read(alice, `id=eq.${alice.id}&select=${MY_PROFILE_COLUMNS}`);
  assert(mine && mine.id === alice.id && mine.full_name, "useMyProfile's column list still works");

  const me = await req('/auth/v1/user', { jwt: alice.jwt });
  const [stored] = await sel('profiles', `id=eq.${alice.id}&select=email`);
  assert(me.email && me.email === stored.email, 'the auth user carries the same email profiles held');
});

await run('the public columns and named embeds still resolve', async () => {
  const rows = await read(bob, `id=eq.${alice.id}&select=id,full_name,avatar_url,onboarded_at`);
  assert(rows.length === 1 && rows[0].full_name, 'public profile columns still readable');
});

await run('anon: email is closed, the schema probe still answers', async () => {
  const rows = await anon('/rest/v1/profiles?select=onboarded_at,location_text,dominant_hand,court_side,notifications_prompted_at&limit=1');
  assert(Array.isArray(rows) && rows.length === 0, 'anon named-column read returns [] rather than 42501');
  await expectError(() => anon('/rest/v1/profiles?select=email&limit=1'), '42501');
});

// ---------------------------------------------------------------------------------------- 0120 --

await run('you cannot write the server-controlled columns of your own row', async () => {
  const now = new Date().toISOString();
  const forbidden = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'hijack@example.com',
    phone: '+351900000000',
    terms_accepted_at: now,
    deleted_at: now,
    created_at: now,
    onboarded_at: now,
    notifications_prompted_at: now,
    location_text: 'Nowhere',
  };
  for (const [col, value] of Object.entries(forbidden)) {
    await expectError(() => write(alice, alice.id, { [col]: value }), '42501');
  }
  // Nor by smuggling one next to an allowed column.
  await expectError(() => write(alice, alice.id, { full_name: 'Sneaky', email: 'hijack@example.com' }), '42501');

  const [after] = await sel('profiles', `id=eq.${alice.id}&select=email,full_name,deleted_at,terms_accepted_at`);
  assert(after.email !== 'hijack@example.com' && after.full_name !== 'Sneaky', 'nothing was written');
  assert(after.deleted_at === null && after.terms_accepted_at === null, 'deletion and consent untouched');
});

await run('you can write each user-editable column', async () => {
  const allowed = {
    full_name: 'Alice Edited',
    avatar_url: `${alice.id}/avatar.jpg`,
    description: 'Left-side lob merchant',
    dominant_hand: 'left',
    court_side: 'right',
    gender: 'female',
    date_of_birth: '1991-02-03',
    preferred_time: 'morning',
    locale: 'pt-PT',
  };
  for (const [col, value] of Object.entries(allowed)) {
    await write(alice, alice.id, { [col]: value });
    assert((await stored(alice.id, col))[col] === value, `${col} was written`);
  }
  // And all at once, which is what useUpdateProfile sends.
  await write(alice, alice.id, { ...allowed, full_name: 'Alice Batch', locale: 'en' });
  const after = await stored(alice.id, 'full_name,locale');
  assert(after.full_name === 'Alice Batch' && after.locale === 'en', 'a multi-column update works');
});

await run("someone else's row stays out of reach, and insert/delete are closed", async () => {
  await write(bob, alice.id, { full_name: 'Bob was here' });
  assert((await stored(alice.id, 'full_name')).full_name !== 'Bob was here', 'RLS still limits the editable columns to your own row');

  await expectError(
    () => req('/rest/v1/profiles', { method: 'POST', jwt: bob.jwt, body: { id: bob.id, full_name: 'Dup' } }),
    '42501',
  );
  await expectError(() => req(`/rest/v1/profiles?id=eq.${bob.id}`, { method: 'DELETE', jwt: bob.jwt }), '42501');
  await expectError(
    () => anon(`/rest/v1/profiles?id=eq.${alice.id}`, { method: 'PATCH', body: JSON.stringify({ full_name: 'anon' }) }),
    '42501',
  );
});

await run('location still goes through set_my_location', async () => {
  await rpc(alice.jwt, 'set_my_location', { p_lat: 38.72, p_lng: -9.14, p_text: 'Lisbon, PT' });
  const [p] = await read(alice, `id=eq.${alice.id}&select=location_text,location_point`);
  assert(p.location_text === 'Lisbon, PT' && p.location_point, 'point and label written by the RPC');
});

await run('mark_onboarded / mark_notifications_prompted stamp the server clock, once', async () => {
  // user() creates an onboarded persona; put Alice back at the start of onboarding.
  await patch('profiles', `id=eq.${alice.id}`, { onboarded_at: null, notifications_prompted_at: null });

  for (const [fn, col] of [['mark_notifications_prompted', 'notifications_prompted_at'], ['mark_onboarded', 'onboarded_at']]) {
    const before = Date.now();
    const at = await rpc(alice.jwt, fn);
    const [row] = await sel('profiles', `id=eq.${alice.id}&select=${col}`);
    assert(at && row[col] && Date.parse(row[col]) === Date.parse(at), `${fn} stored what it returned`);
    // Server clock, not a client value: within a generous skew of this test's clock.
    assert(Math.abs(Date.parse(at) - before) < 60_000, `${fn} stamped now()`);

    const again = await rpc(alice.jwt, fn);
    assert(Date.parse(again) === Date.parse(at), `${fn} keeps the first stamp`);
  }

  // Only the caller's row: Bob's stamps do not move when Alice calls.
  const [bobBefore] = await sel('profiles', `id=eq.${bob.id}&select=onboarded_at`);
  await rpc(alice.jwt, 'mark_onboarded');
  const [bobAfter] = await sel('profiles', `id=eq.${bob.id}&select=onboarded_at`);
  assert(bobBefore.onboarded_at === bobAfter.onboarded_at, "another user's row is untouched");

  for (const fn of ['mark_onboarded', 'mark_notifications_prompted']) {
    await expectError(() => anon(`/rest/v1/rpc/${fn}`, { method: 'POST', body: '{}' }), '42501');
  }
});
