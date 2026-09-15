// infra/supabase/tests/community-entry.test.mjs
//
// Migration 0099, sections 1-3: cancelling a pending request, declining an invitation, and the
// rules acceptance the audit wants captured once, on entry (UX-COMM-04 / UX-COMM-05).
//
// These go through PostgREST with real JWTs rather than psql with `set local role`, because half
// of what is being asserted is who may call what: cancel_join_request must refuse a request that
// is not yours, and an invitation must be declinable only by its invitee.
import { user, rpc, sel, req, insert, expectError, assert, run } from './lib.mjs';

const selAs = (jwt, table, qs) => req(`/rest/v1/${table}?${qs}`, { jwt });

/** A community owned by `owner`. `rules: true` turns on the cancellation and attendance rules. */
const club = (owner, name, { privacy = 'public', rules = false } = {}) =>
  rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: name, p_type: 'club', p_country: 'PT', p_privacy: privacy,
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: rules, p_cancellation_rules_text: rules ? 'Turn up or tell us.' : null,
  });

/** Starter allows one group, which the general group already occupies. */
const upgradeToBasic = (communityId) =>
  insert('community_subscriptions', {
    community_id: communityId, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual',
  });

const generalGroup = async (communityId) =>
  (await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`))[0].id;

const acceptedAt = async (communityId, userId) =>
  (await sel('community_members', `community_id=eq.${communityId}&user_id=eq.${userId}&select=rules_accepted_at`))[0]
    ?.rules_accepted_at ?? null;

// ---------------------------------------------------------------------------
// 1. Cancelling a pending request (UX-COMM-04)
// ---------------------------------------------------------------------------

await run('a requester cancels their own request, and can then make it again', async () => {
  const admin = await user('cancel-admin');
  const joiner = await user('cancel-joiner');
  const stranger = await user('cancel-stranger');
  const cid = await club(admin, 'Cancel Club', { privacy: 'request_to_join' });

  assert((await rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: false })) === 'requested', 'requested');
  const [row] = await sel('community_join_requests', `community_id=eq.${cid}&user_id=eq.${joiner.id}&select=id,status`);
  assert(row.status === 'pending', 'the request is pending');

  // Nobody else's to cancel.
  await expectError(() => rpc(stranger.jwt, 'cancel_join_request', { p_community_id: cid }), 'request_not_found');

  await rpc(joiner.jwt, 'cancel_join_request', { p_community_id: cid });
  const [cancelled] = await sel('community_join_requests', `id=eq.${row.id}&select=status,responded_at,responded_by`);
  assert(cancelled.status === 'cancelled', 'the request is cancelled');
  assert(cancelled.responded_at !== null && cancelled.responded_by === joiner.id, 'the withdrawal is stamped');

  // It is gone from the queue the admin answers.
  const queue = await selAs(admin.jwt, 'community_join_requests', `community_id=eq.${cid}&status=eq.pending&select=id`);
  assert(queue.length === 0, 'the admin queue is empty');

  // Cancelling twice is not a silent no-op.
  await expectError(() => rpc(joiner.jwt, 'cancel_join_request', { p_community_id: cid }), 'request_not_found');

  // Requesting again re-opens the same row rather than colliding with the unique key.
  assert((await rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: false })) === 'requested', 're-requested');
  const again = await sel('community_join_requests', `community_id=eq.${cid}&user_id=eq.${joiner.id}&select=id,status,responded_at`);
  assert(again.length === 1 && again[0].id === row.id, 'still one request row');
  assert(again[0].status === 'pending' && again[0].responded_at === null, 'pending again, with the answer cleared');

  // …and the admin can answer the re-made request.
  await rpc(admin.jwt, 'accept_join_request', { p_request_id: row.id });
  assert((await sel('community_members', `community_id=eq.${cid}&user_id=eq.${joiner.id}&select=role`)).length === 1, 'joined');
});

await run('an admin decision is not undone by the requester tapping again', async () => {
  const admin = await user('decl-admin');
  const joiner = await user('decl-joiner');
  const cid = await club(admin, 'Declined Club', { privacy: 'request_to_join' });

  await rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: false });
  const [row] = await sel('community_join_requests', `community_id=eq.${cid}&user_id=eq.${joiner.id}&select=id`);
  await rpc(admin.jwt, 'decline_join_request', { p_request_id: row.id });

  await rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: false });
  const [after] = await sel('community_join_requests', `id=eq.${row.id}&select=status`);
  assert(after.status === 'declined', 'a declined request stays declined');
  // …and cancelling a request that is not pending is refused rather than rewriting the answer.
  await expectError(() => rpc(joiner.jwt, 'cancel_join_request', { p_community_id: cid }), 'request_not_found');
});

// ---------------------------------------------------------------------------
// 2. Declining an invitation (UX-COMM-04)
// ---------------------------------------------------------------------------

await run('an invitee declines a private invitation, and can be invited again', async () => {
  const admin = await user('inv-admin');
  const invitee = await user('inv-invitee');
  const stranger = await user('inv-stranger');
  const cid = await club(admin, 'Invite Club', { privacy: 'private' });

  await rpc(admin.jwt, 'invite_to_community', { p_community_id: cid, p_invitee_ids: [invitee.id], p_group_ids: [] });
  const [inv] = await selAs(invitee.jwt, 'community_invitations', `community_id=eq.${cid}&select=id,status`);
  assert(inv.status === 'pending', 'the invitation is pending');

  await expectError(() => rpc(stranger.jwt, 'decline_invitation', { p_invitation_id: inv.id }), 'invitation_not_found');

  await rpc(invitee.jwt, 'decline_invitation', { p_invitation_id: inv.id });
  const [declined] = await sel('community_invitations', `id=eq.${inv.id}&select=status,declined_at`);
  assert(declined.status === 'declined' && declined.declined_at !== null, 'declined and stamped');

  // Dismissed: every list of invitations reads the pending index.
  const pending = await selAs(invitee.jwt, 'community_invitations', `invitee_id=eq.${invitee.id}&status=eq.pending&select=id`);
  assert(pending.length === 0, 'no pending invitation remains');
  await expectError(() => rpc(invitee.jwt, 'join_community', { p_community_id: cid, p_ack: false }), 'invite_required');
  await expectError(() => rpc(invitee.jwt, 'decline_invitation', { p_invitation_id: inv.id }), 'invitation_not_found');

  // 0028's `on conflict do nothing` made a decline permanent for the inviter too.
  await rpc(admin.jwt, 'invite_to_community', { p_community_id: cid, p_invitee_ids: [invitee.id], p_group_ids: [] });
  const [reinvited] = await sel('community_invitations', `id=eq.${inv.id}&select=status,declined_at`);
  assert(reinvited.status === 'pending' && reinvited.declined_at === null, 're-invited');
  await rpc(invitee.jwt, 'accept_invitation', { p_invitation_id: inv.id, p_ack: false });
  assert((await sel('community_members', `community_id=eq.${cid}&user_id=eq.${invitee.id}&select=role`)).length === 1, 'joined');
});

await run('joining a private community honours the invitation group selection', async () => {
  // 0028's private branch consumed the invitation but ignored its group_ids, so accepting an
  // invitation BY JOINING silently dropped the groups accept_invitation would have honoured.
  const admin = await user('gsel-admin');
  const invitee = await user('gsel-invitee');
  const cid = await club(admin, 'Group Selection Club', { privacy: 'private' });
  await upgradeToBasic(cid);
  const squad = await rpc(admin.jwt, 'create_group', {
    p_community_id: cid, p_name: 'Squad', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });

  await rpc(admin.jwt, 'invite_to_community', { p_community_id: cid, p_invitee_ids: [invitee.id], p_group_ids: [squad] });
  assert((await rpc(invitee.jwt, 'join_community', { p_community_id: cid, p_ack: false })) === 'joined', 'joined');

  const inSquad = await sel('group_members', `group_id=eq.${squad}&user_id=eq.${invitee.id}&select=user_id`);
  assert(inSquad.length === 1, 'the invitation group selection was honoured');
  const [inv] = await sel('community_invitations', `community_id=eq.${cid}&invitee_id=eq.${invitee.id}&select=status`);
  assert(inv.status === 'accepted', 'the invitation was consumed');
});

// ---------------------------------------------------------------------------
// 3. Rules acceptance, captured once, on entry (UX-COMM-05)
// ---------------------------------------------------------------------------
// Every path that creates a membership records the acceptance on the membership row, and every
// path refuses to create one without it while the community has rules.

await run('a public join records the acceptance, and is refused without it', async () => {
  const admin = await user('rules-pub-admin');
  const joiner = await user('rules-pub-joiner');
  const cid = await club(admin, 'Rules Public Club', { rules: true });

  await expectError(
    () => rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: false }),
    'rules_acknowledgement_required',
  );
  await rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: true });
  assert((await acceptedAt(cid, joiner.id)) !== null, 'acceptance recorded on the membership row');
  // The creator wrote the rules; creating the community is their acceptance.
  assert((await acceptedAt(cid, admin.id)) !== null, 'the creator is stamped too');
});

await run('an approved request records the acceptance the requester gave', async () => {
  const admin = await user('rules-req-admin');
  const joiner = await user('rules-req-joiner');
  const cid = await club(admin, 'Rules Request Club', { privacy: 'request_to_join', rules: true });

  await expectError(
    () => rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: false }),
    'rules_acknowledgement_required',
  );
  await rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: true });
  const [row] = await sel('community_join_requests', `community_id=eq.${cid}&user_id=eq.${joiner.id}&select=id,rules_acknowledged`);
  assert(row.rules_acknowledged === true, 'the request carries the acknowledgement');

  await rpc(admin.jwt, 'accept_join_request', { p_request_id: row.id });
  assert((await acceptedAt(cid, joiner.id)) !== null, 'it reaches the membership row on approval');
});

await run('accepting an invitation records the acceptance, and is refused without it', async () => {
  const admin = await user('rules-inv-admin');
  const invitee = await user('rules-inv-invitee');
  const cid = await club(admin, 'Rules Invite Club', { privacy: 'private', rules: true });
  await rpc(admin.jwt, 'invite_to_community', { p_community_id: cid, p_invitee_ids: [invitee.id], p_group_ids: [] });
  const [inv] = await sel('community_invitations', `community_id=eq.${cid}&invitee_id=eq.${invitee.id}&select=id`);

  await expectError(
    () => rpc(invitee.jwt, 'accept_invitation', { p_invitation_id: inv.id, p_ack: false }),
    'rules_acknowledgement_required',
  );
  await rpc(invitee.jwt, 'accept_invitation', { p_invitation_id: inv.id, p_ack: true });
  assert((await acceptedAt(cid, invitee.id)) !== null, 'acceptance recorded on the membership row');
});

await run('joining a group records the acceptance for the community it lets you into', async () => {
  const admin = await user('rules-grp-admin');
  const joiner = await user('rules-grp-joiner');
  const cid = await club(admin, 'Rules Group Club', { rules: true });
  const general = await generalGroup(cid);

  await expectError(
    () => rpc(joiner.jwt, 'join_group', { p_group_id: general, p_ack: false }),
    'rules_acknowledgement_required',
  );
  await rpc(joiner.jwt, 'join_group', { p_group_id: general, p_ack: true });
  assert((await acceptedAt(cid, joiner.id)) !== null, 'acceptance recorded on the membership row');
});

await run('accepting a group invitation records the acceptance too', async () => {
  const admin = await user('rules-ginv-admin');
  const invitee = await user('rules-ginv-invitee');
  const cid = await club(admin, 'Rules Group Invite Club', { rules: true });
  const general = await generalGroup(cid);

  await rpc(admin.jwt, 'invite_to_group', { p_group_id: general, p_invitee_id: invitee.id });
  await expectError(
    () => rpc(invitee.jwt, 'accept_group_invitation', { p_group_id: general, p_ack: false }),
    'rules_acknowledgement_required',
  );
  await rpc(invitee.jwt, 'accept_group_invitation', { p_group_id: general, p_ack: true });
  assert((await acceptedAt(cid, invitee.id)) !== null, 'acceptance recorded on the membership row');
});

await run('acceptance is asked once, on entry, and nothing else re-asks it', async () => {
  const admin = await user('rules-once-admin');
  const joiner = await user('rules-once-joiner');
  const cid = await club(admin, 'Rules Once Club', { rules: true });
  await upgradeToBasic(cid);
  const squad = await rpc(admin.jwt, 'create_group', {
    p_community_id: cid, p_name: 'Squad', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });

  await rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: true });
  const first = await acceptedAt(cid, joiner.id);

  // A member joining a second group is not re-prompted, and the original moment is not rewritten.
  await rpc(joiner.jwt, 'join_group', { p_group_id: squad, p_ack: false });
  assert((await acceptedAt(cid, joiner.id)) === first, 'the acceptance is unchanged');
});

await run('a community without rules records no acceptance', async () => {
  const admin = await user('norules-admin');
  const joiner = await user('norules-joiner');
  const cid = await club(admin, 'No Rules Club');
  await rpc(joiner.jwt, 'join_community', { p_community_id: cid, p_ack: false });
  assert((await acceptedAt(cid, joiner.id)) === null, 'nothing to accept, nothing recorded');
});
