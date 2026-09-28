// infra/supabase/tests/profile-phone-privacy.test.mjs
//
// Migration 0115 — nobody reads anybody's phone number through the Data API (UX events plan,
// decision 2 / B11). Before it, `profiles: read` (0055) plus the table-wide SELECT grant (0030) let
// any signed-in user list every phone in the app.
//
// Every read goes through PostgREST with a real user's JWT (or the anon key), never the service key:
// the service role keeps full access by design, so it would make every assertion here pass.
import { user, rpc, req, sel, ANON, BASE_URL, assert, expectError, run } from './lib.mjs';

/** The exact column list `useMyProfile` selects (packages/api/src/profile/queries.ts). */
const MY_PROFILE_COLUMNS =
  'id,full_name,avatar_url,description,date_of_birth,gender,dominant_hand,court_side,preferred_time,location_text';

const asUser = (u, qs) => req(`/rest/v1/profiles?${qs}`, { jwt: u.jwt });

async function asAnon(qs) {
  const res = await fetch(`${BASE_URL}/rest/v1/profiles?${qs}`, { headers: { apikey: ANON } });
  const text = await res.text();
  if (!res.ok) throw new Error(`anon GET profiles?${qs} → ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const [alice, bob] = await Promise.all([user('pp-a'), user('pp-b')]);

await run("another user cannot read your phone, by name or through *", async () => {
  await expectError(() => asUser(bob, `id=eq.${alice.id}&select=phone`), '42501');
  await expectError(() => asUser(bob, `id=eq.${alice.id}&select=*`), '42501');
  // Nor by filtering on it — a WHERE on a column needs SELECT on it too, or phone becomes an oracle.
  await expectError(() => asUser(bob, `phone=like.%2B351*&select=id`), '42501');
});

await run('the public columns are still readable', async () => {
  const rows = await asUser(bob, `id=eq.${alice.id}&select=id,full_name,avatar_url`);
  assert(rows.length === 1 && rows[0].id === alice.id && rows[0].full_name, 'name/avatar still readable');
});

await run('your own phone comes from the auth user, not profiles', async () => {
  // Not even your own row's phone: column privileges are per role, not per row.
  await expectError(() => asUser(alice, `id=eq.${alice.id}&select=phone`), '42501');

  const [mine] = await asUser(alice, `id=eq.${alice.id}&select=${MY_PROFILE_COLUMNS}`);
  assert(mine && mine.id === alice.id && mine.full_name, "useMyProfile's column list still works");

  const me = await req('/auth/v1/user', { jwt: alice.jwt });
  const [stored] = await sel('profiles', `id=eq.${alice.id}&select=phone`); // service key
  assert(me.phone, 'the auth user carries the phone');
  assert(`+${me.phone.replace(/^\+/, '')}` === stored.phone, 'and it is the same number profiles held');
});

await run('named profile embeds still resolve; profiles(*) does not', async () => {
  const cid = await rpc(alice.jwt, 'create_community_with_personal_tenant', {
    p_name: `PP ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
  });
  const ok = await req(
    `/rest/v1/community_members?community_id=eq.${cid}&select=user_id,role,profiles(id,full_name,avatar_url)`,
    { jwt: alice.jwt },
  );
  assert(ok.length === 1 && ok[0].profiles?.full_name, 'explicit embed returns the profile');
  await expectError(
    () => req(`/rest/v1/community_members?community_id=eq.${cid}&select=user_id,profiles(*)`, { jwt: alice.jwt }),
    '42501',
  );
});

await run('anon: phone is closed, the schema probe still answers', async () => {
  // scripts/check-remote-schema.mjs selects named columns as anon; the read policy returns no rows,
  // but the request must not error.
  const rows = await asAnon('select=onboarded_at,location_text&limit=1');
  assert(Array.isArray(rows) && rows.length === 0, 'anon named-column read returns [] rather than 42501');
  await expectError(() => asAnon('select=phone&limit=1'), '42501');
});
