// infra/supabase/tests/my-auth-providers.test.mjs
// my_auth_providers() (migration 0132): the signed-in caller's own sign-in methods, which the
// Privacy row and the Change password screen branch on. It replaced the auth_providers view — same
// five booleans — after Supabase's security advisor flagged the view for exposing auth.users. The view
// survived as a shim over the function for builds that still queried it, until 0145 dropped it.
// Every call here goes through PostgREST with a real user token, because that is the path the app
// takes and the path 0003's view never once succeeded on.
import {
  adminCreateUser,
  user,
  rpc,
  anonRpc,
  req,
  expectError,
  assert,
  run,
  BASE_URL,
  ANON,
} from './lib.mjs';

const RUN = process.env.TEST_RUN || Date.now().toString(36);

/** A session for an account with NO password, obtained the way a real one is: a one-time code. */
async function otpSession(email) {
  const link = await req('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: { type: 'magiclink', email },
  });
  const session = await req('/auth/v1/verify', {
    method: 'POST',
    body: { type: 'magiclink', token_hash: link.hashed_token },
  });
  return session.access_token;
}

/** `returns table` always sends an array; a signed-in caller gets exactly one row. */
const mine = async (jwt) => {
  const rows = await rpc(jwt, 'my_auth_providers');
  assert(
    Array.isArray(rows) && rows.length === 1,
    `one row for a signed-in caller, got ${JSON.stringify(rows)}`,
  );
  return rows[0];
};

const EMAIL = `map-${RUN}@authproviders.local`;
const PHONE = '+3519' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const id = await adminCreateUser(EMAIL, PHONE, null);
const jwt = await otpSession(EMAIL);

await run('a passwordless account reports its addresses and no password', async () => {
  const r = await mine(jwt);
  assert(
    JSON.stringify(Object.keys(r).sort()) ===
      JSON.stringify(['has_apple', 'has_email', 'has_google', 'has_password', 'has_phone']),
    `exactly the five booleans, no user_id, got ${Object.keys(r)}`,
  );
  assert(r.has_email === true, 'has_email');
  assert(r.has_phone === true, 'has_phone');
  // The case the whole column exists for: Privacy must say "Create password", not "Change".
  assert(r.has_password === false, 'has_password is false');
  assert(r.has_google === false && r.has_apple === false, 'no social identity was invented');
});

await run('each caller is answered about their own account only', async () => {
  // `user()` gives its persona a password; the account above still has none. The function takes
  // no argument, so the only thing that can tell the two apart is whose token made the call.
  const other = await user('map-other');
  assert((await mine(other.jwt)).has_password === true, 'the other caller sees their password');
  assert((await mine(jwt)).has_password === false, 'and this caller still sees none');
});

await run('a password chosen later shows up on the very next call, on the same token', async () => {
  // An UPDATE of encrypted_password, which is what 0101's trigger records. Change password
  // invalidates the query right after setPassword and expects the next read to say so.
  await req(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: { password: 'Padel1234#' } });
  assert(
    (await mine(jwt)).has_password === true,
    'has_password follows the account, not the token',
  );
});

await run('without a user in the token there is no row at all', async () => {
  // The service key's JWT carries no sub, so auth.uid() is null — the same answer anon would get
  // from the body if the grant ever let it in.
  const rows = await rpc(undefined, 'my_auth_providers');
  assert(
    Array.isArray(rows) && rows.length === 0,
    `no row without a user, got ${JSON.stringify(rows)}`,
  );
});

await run('anon may not call it at all', async () => {
  await expectError(() => anonRpc('my_auth_providers'), 'permission denied');
});

await run('the auth_providers view is gone, for a signed-in caller too (0145)', async () => {
  // 0132 kept the view as a shim for TestFlight build 17 and older; 0145 drops it now that build 18
  // calls the function. A signed-in caller is the one who could read the shim, so ask as one: the
  // API must not know the relation at all (PGRST205 on current PostgREST, 42P01 on older ones).
  const res = await fetch(
    `${BASE_URL}/rest/v1/auth_providers?select=has_password,has_email,has_phone,has_google,has_apple`,
    { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } },
  );
  const body = await res.json().catch(() => ({}));
  assert(
    res.status === 404 && ['PGRST205', '42P01'].includes(body.code),
    `expected the view to be unknown, got HTTP ${res.status}: ${JSON.stringify(body)}`,
  );
});
