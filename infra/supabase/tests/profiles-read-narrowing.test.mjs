// infra/supabase/tests/profiles-read-narrowing.test.mjs
//
// Migration 0163 (PAD-167, PR C): a client reads only id, full_name and avatar_url from `profiles`;
// everything else about your own row comes from get_my_profile_state / get_my_private_profile.
// community_plan is not executable by authenticated, but join limits still work. Real JWTs only.
import { user, rpc, anonRpc, sel, req, ANON, BASE_URL, expectError, assert, run } from './lib.mjs';

const asUser = (u, qs) => req(`/rest/v1/profiles?${qs}`, { jwt: u.jwt });
const asAnon = (qs) => req(`/rest/v1/profiles?${qs}`, { jwt: ANON });
const REVOKED = [
  'locale', 'onboarded_at', 'terms_accepted_at', 'notifications_prompted_at', 'created_at', 'deleted_at',
  'description', 'dominant_hand', 'court_side', 'level', 'preferred_time', 'location_text',
  'date_of_birth', 'gender', 'location_point', 'email', 'phone',
];

const [alice, bob] = await Promise.all([user('prn-a'), user('prn-b')]);

await run('the directory columns still read, for anyone signed in', async () => {
  const rows = await asUser(alice, `id=eq.${bob.id}&select=id,full_name,avatar_url`);
  assert(rows.length === 1, 'id, full_name, avatar_url readable');
  const found = await asUser(alice, `full_name=ilike.*prn*&select=id&limit=5`);
  assert(Array.isArray(found), 'filtering by name still works');
});

await run("every other column is refused, as a select and as a filter, on your row and someone else's", async () => {
  for (const c of REVOKED) {
    for (const id of [alice.id, bob.id]) {
      await expectError(() => asUser(alice, `id=eq.${id}&select=${c}`), '42501');
    }
    await expectError(() => asUser(alice, `${c}=not.is.null&select=id`), '42501');
  }
});

await run('anon is refused the same way', async () => {
  for (const c of REVOKED) await expectError(() => asAnon(`select=${c}&limit=1`), '42501');
});

await run('your own row still comes through the functions', async () => {
  const [me] = await rpc(alice.jwt, 'get_my_profile_state');
  assert(me && 'onboarded_at' in me && 'locale' in me, 'get_my_profile_state answers');
  await rpc(alice.jwt, 'get_my_private_profile');
});

await run('writes to your own row still work', async () => {
  const r = await req(`/rest/v1/profiles?id=eq.${alice.id}`, { method: 'PATCH', jwt: alice.jwt, body: { description: 'hello', level: 2 }, prefer: 'return=minimal' });
  assert(r !== undefined, 'patch accepted');
  const [me] = await rpc(alice.jwt, 'get_my_profile_state');
  assert(me.description === 'hello' && me.level === 2, 'write visible through the function');
});

await run('community_plan is refused to authenticated and anon; the member plan function answers', async () => {
  const cid = await rpc(alice.jwt, 'create_community_with_personal_tenant', {
    p_name: 'PRN Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await expectError(() => rpc(alice.jwt, 'community_plan', { c: cid }), 'permission denied for function');
  await expectError(() => anonRpc('community_plan', { c: cid }), 'permission denied for function');
  assert((await rpc(alice.jwt, 'get_my_community_plan', { c: cid })) === 'starter', 'member plan');
  // join_community calls community_plan internally as the owner; it must still work.
  await rpc(bob.jwt, 'join_community', { p_community_id: cid });
  const m = await sel('community_members', `community_id=eq.${cid}&user_id=eq.${bob.id}&select=user_id`);
  assert(m.length === 1, 'join still works');
});
