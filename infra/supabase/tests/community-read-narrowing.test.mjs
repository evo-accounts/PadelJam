// infra/supabase/tests/community-read-narrowing.test.mjs
//
// Migration 0161/0162 (PAD-164): a private community is not discoverable, a community's plan is for
// its members, get_my_profile_state answers for the caller alone, and the OpenAPI document is off.
// Through PostgREST with real JWTs, never as postgres.
import { user, rpc, anonRpc, sel, insert, del, patch, req, ANON, BASE_URL, expectError, assert, run } from './lib.mjs';

const selAs = (jwt, table, qs) => req(`/rest/v1/${table}?${qs}`, { jwt });
const club = (owner, name, privacy) =>
  rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: name, p_type: 'club', p_country: 'PT', p_privacy: privacy,
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
const row = async (u, cid) => (await selAs(u.jwt, 'communities', `id=eq.${cid}&select=id,name`)).length === 1;
const count = (u, cid) => rpc(u.jwt, 'community_member_count', { c: cid });
const plan = (u, cid) => rpc(u.jwt, 'get_my_community_plan', { c: cid });
const general = async (cid) => (await sel('groups', `community_id=eq.${cid}&is_general=eq.true&select=id`))[0].id;

await run('an outsider gets nothing about a private community, a member gets everything', async () => {
  const admin = await user('cr-admin');
  const outsider = await user('cr-outsider');
  const cid = await club(admin, 'Secret Club', 'private');

  assert(!(await row(outsider, cid)), 'outsider reads no row');
  assert((await count(outsider, cid)) === null, 'outsider count is null');
  assert((await plan(outsider, cid)) === null, 'outsider plan is null');

  assert(await row(admin, cid), 'member reads the row');
  assert((await count(admin, cid)) === 1, 'member count');
  assert((await plan(admin, cid)) === 'starter', 'member plan');
  assert((await rpc(outsider.jwt, 'can_read_community', { c: cid })) === false, 'can_read false');
});

await run('pending community invitee and pending group invitee read a private community until it is withdrawn', async () => {
  const admin = await user('cr-inv-admin');
  const byCommunity = await user('cr-inv-c');
  const byGroup = await user('cr-inv-g');
  const cid = await club(admin, 'Invite Only Club', 'private');
  const gid = await general(cid);

  const [ci] = await insert('community_invitations', { community_id: cid, inviter_id: admin.id, invitee_id: byCommunity.id });
  const [gi] = await insert('group_invitations', { group_id: gid, inviter_id: admin.id, invitee_id: byGroup.id });
  for (const u of [byCommunity, byGroup]) {
    assert(await row(u, cid), 'invitee reads the row');
    assert((await count(u, cid)) === 1, 'invitee reads the count');
    assert((await plan(u, cid)) === null, 'invitee has no plan');
  }
  await del('community_invitations', `id=eq.${ci.id}`);
  await del('group_invitations', `id=eq.${gi.id}`);
  for (const u of [byCommunity, byGroup]) {
    assert(!(await row(u, cid)), 'row gone after the invitation is gone');
    assert((await count(u, cid)) === null, 'count gone');
  }
});

await run('a declined (accepted-status) invitation no longer opens a private community', async () => {
  const admin = await user('cr-acc-admin');
  const invitee = await user('cr-acc-i');
  const cid = await club(admin, 'Accepted Club', 'private');
  const [ci] = await insert('community_invitations', { community_id: cid, inviter_id: admin.id, invitee_id: invitee.id });
  await patch('community_invitations', `id=eq.${ci.id}`, { status: 'accepted' });
  assert(!(await row(invitee, cid)), 'a non-pending invitation does not grant the read');
});

await run('a removed member loses the row, the count and the plan', async () => {
  const admin = await user('cr-rm-admin');
  const member = await user('cr-rm-member');
  const cid = await club(admin, 'Leaving Club', 'private');
  await insert('community_members', { community_id: cid, user_id: member.id, role: 'member' });
  assert(await row(member, cid) && (await plan(member, cid)) === 'starter', 'member reads while in');
  await del('community_members', `community_id=eq.${cid}&user_id=eq.${member.id}`);
  assert(!(await row(member, cid)), 'row gone');
  assert((await count(member, cid)) === null, 'count gone');
  assert((await plan(member, cid)) === null, 'plan gone');
});

await run('public and request-to-join keep their preview; only members get the plan', async () => {
  const admin = await user('cr-pub-admin');
  const outsider = await user('cr-pub-out');
  for (const privacy of ['public', 'request_to_join']) {
    const cid = await club(admin, `Open ${privacy}`, privacy);
    assert(await row(outsider, cid), `${privacy}: outsider reads the row`);
    assert((await count(outsider, cid)) === 1, `${privacy}: outsider reads the count`);
    assert((await plan(outsider, cid)) === null, `${privacy}: outsider has no plan`);
  }
});

await run('an archived community stays admin-only, and has no count', async () => {
  const admin = await user('cr-arch-admin');
  const outsider = await user('cr-arch-out');
  const cid = await club(admin, 'Archived Open Club', 'public');
  await rpc(admin.jwt, 'archive_community', { p_community_id: cid, p_archive: true });
  assert(await row(admin, cid), 'admin still reads it');
  assert(!(await row(outsider, cid)), 'outsider does not');
  assert((await count(admin, cid)) === null, 'archived has no count');
});

await run('get_my_profile_state answers for the caller only and takes no target', async () => {
  const a = await user('cr-state-a');
  const b = await user('cr-state-b');
  const rowsA = await rpc(a.jwt, 'get_my_profile_state');
  assert(rowsA.length === 1, 'one row');
  assert(rowsA[0].locale === 'en' && rowsA[0].onboarded_at && rowsA[0].location_text === 'Lisbon, PT', 'own state');
  assert(rowsA[0].dominant_hand === 'right' && rowsA[0].court_side === 'left', 'own game fields');
  const keys = Object.keys(rowsA[0]).sort().join(',');
  assert(keys === 'court_side,description,dominant_hand,level,locale,location_text,notifications_prompted_at,onboarded_at,preferred_time', `columns: ${keys}`);
  // A target parameter is not accepted: PostgREST has no such function.
  await expectError(() => rpc(b.jwt, 'get_my_profile_state', { p_user: a.id }), 'get_my_profile_state');
  const none = await rpc(b.jwt, 'get_my_profile_state');
  assert(none.length === 1, 'b gets b');
});

await run('anon cannot execute any new function', async () => {
  const cases = [['can_read_community', { c: '00000000-0000-0000-0000-000000000000' }],
    ['community_member_count', { c: '00000000-0000-0000-0000-000000000000' }],
    ['get_my_community_plan', { c: '00000000-0000-0000-0000-000000000000' }],
    ['get_my_profile_state', {}]];
  for (const [name, args] of cases) await expectError(() => anonRpc(name, args), '401');
});

await run('anon cannot fetch the OpenAPI document, and normal reads still work', async () => {
  const res = await fetch(`${BASE_URL}/rest/v1/`, { headers: { apikey: ANON } });
  assert(res.status !== 200, `anon GET /rest/v1/ answered ${res.status}`);
  const u = await user('cr-openapi');
  const own = await selAs(u.jwt, 'profiles', `id=eq.${u.id}&select=id,full_name`);
  assert(own.length === 1, 'a table read still works');
});

await run('anon reads communities as an empty list, not 42501 (policy is to authenticated)', async () => {
  const res = await fetch(`${BASE_URL}/rest/v1/communities?select=id`, { headers: { apikey: ANON } });
  assert(res.status === 200, `anon GET communities answered ${res.status}`);
  const body = await res.json();
  assert(Array.isArray(body) && body.length === 0, 'anon sees no communities');
});
