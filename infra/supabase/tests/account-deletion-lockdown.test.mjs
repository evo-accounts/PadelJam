// infra/supabase/tests/account-deletion-lockdown.test.mjs
//
// Account deletion (0143/0144). A signed-in user could run soft_delete_account() straight over
// PostgREST. That skipped the delete-account function's ban, and the body erased every block OTHER
// people had placed on the caller. Now the only way to delete an account is the delete-account edge
// function: it verifies the JWT with GoTrue and runs soft_delete_account(p_user) as service_role for
// that id. The ban happens inside the same transaction, blocks others placed on the account stay,
// and the organizer's Activity feed still gets the player's "left" (0122), service role or not.
//
// SERVING THE FUNCTION: the edge-function cases hit the local gateway, which serves whatever
// checkout `supabase start` ran from (CI's db-tests job starts it from the branch). In a worktree,
// serve this branch's copy yourself and point DELETE_ACCOUNT_URL at it — the docker line is in the
// header of complete-account-consent.test.mjs.
import { BASE_URL, user, rpc, anonRpc, req, sel, expectError, assert, run } from './lib.mjs';

const FN_URL = process.env.DELETE_ACCOUNT_URL || `${BASE_URL}/functions/v1/delete-account`;
const DENIED = 'permission denied for function soft_delete_account';
const PASSWORD = 'Padel1234#';
const IN_99_YEARS = Date.now() + 99 * 365 * 864e5;
const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();

const deleteAccount = async (jwt) => {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const authUser = (id) => req(`/auth/v1/admin/users/${id}`);
const isBanned = async (id) => {
  const u = await authUser(id);
  return Boolean(u.banned_until) && Date.parse(u.banned_until) > IN_99_YEARS;
};
const profile = async (id) => (await sel('profiles', `id=eq.${id}&select=full_name,deleted_at`))[0];
const hasBlock = async (blocker, blocked) =>
  (await sel('blocks', `blocker_id=eq.${blocker}&blocked_id=eq.${blocked}&select=id`)).length === 1;
const leftRows = (eventId, actorId) =>
  sel('event_activity', `event_id=eq.${eventId}&action=eq.left&actor_id=eq.${actorId}&select=detail`);
/** lib's signIn keeps only the access token, and these cases need the refresh token too. */
const passwordGrant = (email) =>
  req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: PASSWORD } });
const refresh = (refresh_token) =>
  req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token } });
/** Resolves to the HTTP status a refused auth call failed with (lib's req puts it in the message). */
const refusedWith = async (fn) => {
  try { await fn(); } catch (e) {
    const m = String(e.message).match(/→ (\d{3}):/);
    return { status: m ? Number(m[1]) : null, message: e.message };
  }
  return { status: 200, message: 'the call succeeded' };
};

/** A private group-less event the player is confirmed in — deleting their account drops them from it. */
const upcomingEventWith = async (host, player) => {
  const ev = await rpc(host.jwt, 'create_event', {
    p_payload: {
      group_id: null, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
      organizer_role: 'organizing_only', name: 'Deletion', venue_id: null,
      manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
      location_lat: null, location_lng: null, location_text: null,
      num_courts: 1, starts_at: hoursFromNow(72), duration_minutes: 90,
      allow_standby: false, standby_spots: null, is_private: true, players_submit_results: false,
      entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
      description: null, thumbnail_path: null, series: null, court_ids: null,
      invitees: [{ invitee_id: player.id, name: null, email: null, phone: null }],
    },
  });
  assert((await rpc(player.jwt, 'join_event', { p_event_id: ev })) === 'confirmed', 'the player is confirmed');
  return ev;
};

const target = await user('sda-target'); // deletes their own account
const blocker = await user('sda-blocker'); // blocked the target
const blockee = await user('sda-blockee'); // blocked BY the target
const bystander = await user('sda-bystander'); // the target tries to delete them
const svc = await user('sda-svc'); // deleted by service_role directly
const host = await user('sda-host'); // organizes the events the deleted players were in
await rpc(blocker.jwt, 'block_user', { p_target: target.id });
await rpc(blocker.jwt, 'block_user', { p_target: svc.id });
await rpc(target.jwt, 'block_user', { p_target: blockee.id });
const targetEvent = await upcomingEventWith(host, target);
const svcEvent = await upcomingEventWith(host, svc);

await run('a signed-in user cannot run soft_delete_account over PostgREST, for themselves', async () => {
  await expectError(() => rpc(target.jwt, 'soft_delete_account', { p_user: target.id }), DENIED);
  assert((await profile(target.id)).deleted_at === null, 'the target is not deleted');
  assert(await hasBlock(blocker.id, target.id), 'the block placed on the target is untouched');
  assert(!(await isBanned(target.id)), 'the target is not banned');
});

await run('a signed-in user cannot run soft_delete_account for somebody else', async () => {
  await expectError(() => rpc(target.jwt, 'soft_delete_account', { p_user: bystander.id }), DENIED);
  const p = await profile(bystander.id);
  assert(p.deleted_at === null && p.full_name !== 'Deleted user', 'the bystander is untouched');
});

await run('anon cannot run soft_delete_account', async () => {
  await expectError(() => anonRpc('soft_delete_account', { p_user: target.id }), DENIED);
  await expectError(() => anonRpc('soft_delete_account', {}), DENIED);
});

await run('the zero-argument soft_delete_account() is closed to signed-in users (0144)', async () => {
  // The exploit's own request. Before 0143 this erased every block on the caller and skipped the ban.
  await expectError(() => rpc(target.jwt, 'soft_delete_account', {}), DENIED);
  assert((await profile(target.id)).deleted_at === null, 'the target is not deleted');
  assert(await hasBlock(blocker.id, target.id), 'the block placed on the target is untouched');
});

await run('service_role CAN run soft_delete_account for an explicit user, which is the edge function’s path', async () => {
  await rpc(null, 'soft_delete_account', { p_user: svc.id }); // no jwt → the service key, no `sub`
  const p = await profile(svc.id);
  assert(p.full_name === 'Deleted user' && p.deleted_at !== null, 'the profile is anonymized and marked deleted');
  assert(await isBanned(svc.id), 'banned in the same call, with no GoTrue admin request involved');
  assert(await hasBlock(blocker.id, svc.id), 'the block another user placed survives');
  // The service role carries no `sub`; the function pins auth.uid() so 0122's trigger still logs it.
  const left = await leftRows(svcEvent, svc.id);
  assert(left.length === 1, `the organizer's Activity feed got one "left" for the deleted player, got ${JSON.stringify(left)}`);
});

await run('the user CAN delete their own account through the edge function; others’ blocks on them stay', async () => {
  const { email } = await authUser(target.id);
  const session = await passwordGrant(email);
  // The matching "can": before deletion, the refresh token works.
  const rotated = await refresh(session.refresh_token);
  assert(rotated.access_token, 'a live account can refresh');

  const { status, body } = await deleteAccount(rotated.access_token);
  assert(status === 200 && body?.ok === true, `delete-account returned ${status}: ${JSON.stringify(body)}`);

  const p = await profile(target.id);
  assert(p.full_name === 'Deleted user' && p.deleted_at !== null, 'the profile is anonymized and marked deleted');
  assert(await isBanned(target.id), 'the auth user is banned');
  assert(await hasBlock(blocker.id, target.id), 'the block ANOTHER user placed on the deleted account survives');
  assert(!(await hasBlock(target.id, blockee.id)), 'the block the deleted account placed is gone');
  const listed = await rpc(blocker.jwt, 'list_my_blocks', { p_search: null, p_limit: 50, p_offset: 0 });
  assert(listed.some((b) => b.id === target.id && b.full_name === 'Deleted user'),
    'the blocker still sees the block, as "Deleted user", and can remove it themselves');
  const left = await leftRows(targetEvent, target.id);
  assert(left.length === 1, `the organizer's Activity feed got one "left", got ${JSON.stringify(left)}`);

  // The matching "cannot": after deletion, neither the refresh token nor the old credentials work.
  // Which refusal GoTrue gives depends on its version (banned user vs a session its ban revoked), so
  // only the refusal is asserted; the message is printed for the log.
  const r = await refusedWith(() => refresh(rotated.refresh_token));
  console.log(`  refresh after deletion refused: ${r.message}`);
  assert(r.status >= 400 && r.status < 500, `a deleted account could still refresh its session (${r.status})`);
  const s = await refusedWith(() => passwordGrant(email));
  assert(s.status >= 400 && s.status < 500, `the old credentials still sign in (${s.status}): ${s.message}`);
});

const communityArgs = (name) => ({
  p_name: name, p_type: 'club', p_country: 'PT', p_privacy: 'public',
  p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
  p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
});
const soleAdmin = await user('sda-admin');
const member = await user('sda-member');
const cid = await rpc(soleAdmin.jwt, 'create_community_with_personal_tenant', communityArgs('Deletion Club'));
await rpc(member.jwt, 'join_community', { p_community_id: cid, p_ack: true });

await run('the sole admin of a community with members cannot delete, and nothing is deleted or banned', async () => {
  const { status, body } = await deleteAccount(soleAdmin.jwt);
  assert(status === 400, `expected 400, got ${status}`);
  assert(String(body?.error).includes('last_admin_must_promote_first'), `the apps' mapped code, got ${JSON.stringify(body)}`);
  assert((await profile(soleAdmin.id)).deleted_at === null, 'the refused account is not deleted');
  assert(!(await isBanned(soleAdmin.id)), 'the ban rolled back with the refused deletion');
  const rows = await sel('community_members', `community_id=eq.${cid}&user_id=eq.${soleAdmin.id}&select=role`);
  assert(rows.length === 1 && rows[0].role === 'admin', 'still the admin');
});

await run('a plain member of that community CAN delete through the edge function', async () => {
  const { status } = await deleteAccount(member.jwt);
  assert(status === 200, `expected 200, got ${status}`);
  assert(await isBanned(member.id), 'banned');
  const rows = await sel('community_members', `community_id=eq.${cid}&user_id=eq.${member.id}&select=id`);
  assert(rows.length === 0, 'membership dropped');
});
