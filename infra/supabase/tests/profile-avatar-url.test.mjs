// infra/supabase/tests/profile-avatar-url.test.mjs
//
// Migration 0131 — avatar_url is null or a path in the owner's own folder of the avatars bucket.
// Writes go through PostgREST with the user's own JWT, as the apps' useUpdateProfile does.
import { user, req, sel, assert, expectError, run } from './lib.mjs';

const write = (u, fields) =>
  req(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', jwt: u.jwt, body: fields, prefer: 'return=minimal' });
const stored = async (u) => (await sel('profiles', `id=eq.${u.id}&select=avatar_url`))[0].avatar_url; // service key

const [alice, bob] = await Promise.all([user('av-a'), user('av-b')]);

await run('the paths the apps write are accepted, and null clears it', async () => {
  for (const path of [
    `${alice.id}/lq3k9a-x7f2.jpg`, // mobile: {uid}/{base36 time}-{rand}.{ext}
    `${alice.id}/6f1c2a4e-0d8b-4c1e-9a55-3b7e2f90c1aa.png`, // web: {uid}/{uuid}.{ext}
    `${alice.id}/audit.png`, // audit seed
  ]) {
    await write(alice, { avatar_url: path });
    assert((await stored(alice)) === path, `${path} was stored`);
  }
  await write(alice, { avatar_url: null });
  assert((await stored(alice)) === null, 'null clears the avatar');
});

await run('a URL, someone else\'s folder, a nested or bare path are rejected', async () => {
  await write(alice, { avatar_url: `${alice.id}/keep.jpg` });
  for (const bad of [
    'https://tracker.example.com/pixel.gif',
    `${bob.id}/avatar.jpg`,
    `${alice.id}/nested/avatar.jpg`,
    'avatar.jpg',
    `avatars/${alice.id}/avatar.jpg`,
    '',
  ]) {
    await expectError(() => write(alice, { avatar_url: bad }), '23514');
  }
  assert((await stored(alice)) === `${alice.id}/keep.jpg`, 'the rejected writes left the avatar unchanged');
});
