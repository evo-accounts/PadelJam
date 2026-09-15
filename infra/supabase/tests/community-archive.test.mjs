// infra/supabase/tests/community-archive.test.mjs
//
// Migration 0099, sections 4-5: archived communities and groups are visible to admins only
// (UX-COMM-24), unarchiving restores only what the archive took, and the count it returns is the
// number the confirmation sheet states.
//
// The visibility half goes through PostgREST with real JWTs on purpose: before 0099 nothing
// filtered archived_at in RLS, so a member's direct select returned archived rows even though
// every client query happened to filter them.
import { user, rpc, sel, req, insert, assert, run } from './lib.mjs';

const selAs = (jwt, table, qs) => req(`/rest/v1/${table}?${qs}`, { jwt });

const club = (owner, name) =>
  rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: name, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });

/** Starter allows one group, which the general group already occupies. */
const upgradeToBasic = (communityId) =>
  insert('community_subscriptions', {
    community_id: communityId, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual',
  });

const newGroup = (owner, communityId, name) =>
  rpc(owner.jwt, 'create_group', {
    p_community_id: communityId, p_name: name, p_description: null, p_is_private: false, p_thumbnail_path: null,
  });

const archivedAt = async (groupId) =>
  (await sel('groups', `id=eq.${groupId}&select=archived_at`))[0].archived_at;

await run('a member sees neither an archived community nor its groups; an admin sees both', async () => {
  const admin = await user('arch-admin');
  const member = await user('arch-member');
  const cid = await club(admin, 'Archive Visibility Club');
  await rpc(member.jwt, 'join_community', { p_community_id: cid, p_ack: false });
  const general = (await sel('groups', `community_id=eq.${cid}&is_general=eq.true&select=id`))[0].id;

  assert((await selAs(member.jwt, 'communities', `id=eq.${cid}&select=id`)).length === 1, 'visible while active');
  assert((await selAs(member.jwt, 'groups', `id=eq.${general}&select=id`)).length === 1, 'group visible while active');

  const archived = await rpc(admin.jwt, 'archive_community', { p_community_id: cid, p_archive: true });
  assert(archived === 1, `the general group was archived with it (got ${archived})`);

  assert((await selAs(member.jwt, 'communities', `id=eq.${cid}&select=id`)).length === 0, 'the member sees no community');
  assert((await selAs(member.jwt, 'groups', `id=eq.${general}&select=id`)).length === 0, 'the member sees no group');
  assert((await selAs(admin.jwt, 'communities', `id=eq.${cid}&select=id`)).length === 1, 'the admin still does');
  assert((await selAs(admin.jwt, 'groups', `id=eq.${general}&select=id`)).length === 1, 'and still sees the group');

  // The switcher's Archived section is this query (UX-COMM-09): the membership row survives for
  // both, and only the admin's embed resolves to a community.
  const adminRows = await selAs(admin.jwt, 'community_members', `user_id=eq.${admin.id}&community_id=eq.${cid}&select=role,communities(id,archived_at)`);
  assert(adminRows.length === 1 && adminRows[0].communities?.id === cid, 'the admin switcher still reads it');
  assert(adminRows[0].communities.archived_at !== null, 'and can tell it is archived');
  const memberRows = await selAs(member.jwt, 'community_members', `user_id=eq.${member.id}&community_id=eq.${cid}&select=role,communities(id)`);
  assert(memberRows.length === 1 && memberRows[0].communities === null, 'the member gets no community back');

  // Unarchiving gives it back.
  const restored = await rpc(admin.jwt, 'archive_community', { p_community_id: cid, p_archive: false });
  assert(restored === 1, `one group came back (got ${restored})`);
  assert((await selAs(member.jwt, 'communities', `id=eq.${cid}&select=id`)).length === 1, 'the member sees it again');
  assert((await selAs(member.jwt, 'groups', `id=eq.${general}&select=id`)).length === 1, 'and its group');
});

await run('unarchiving restores only the groups the archive took', async () => {
  const admin = await user('unarch-admin');
  const cid = await club(admin, 'Restore Club');
  await upgradeToBasic(cid);
  const general = (await sel('groups', `community_id=eq.${cid}&is_general=eq.true&select=id`))[0].id;
  const alpha = await newGroup(admin, cid, 'Alpha');
  const beta = await newGroup(admin, cid, 'Beta');

  // Beta is retired on its own, BEFORE the community is archived. 0028 resurrected it.
  await rpc(admin.jwt, 'archive_group', { p_group_id: beta });
  const betaArchivedAt = await archivedAt(beta);
  assert(betaArchivedAt !== null, 'Beta is archived on its own');

  const archived = await rpc(admin.jwt, 'archive_community', { p_community_id: cid, p_archive: true });
  assert(archived === 2, `only the two active groups were archived (got ${archived})`);

  const restored = await rpc(admin.jwt, 'archive_community', { p_community_id: cid, p_archive: false });
  assert(restored === 2, `only those two came back (got ${restored})`);

  assert((await archivedAt(general)) === null, 'the general group is active again');
  assert((await archivedAt(alpha)) === null, 'Alpha is active again');
  assert((await archivedAt(beta)) === betaArchivedAt, 'Beta stayed archived, at its own moment');

  // The flag is not left behind on the groups that came back.
  const flagged = await sel('groups', `community_id=eq.${cid}&archived_with_community=eq.true&select=id`);
  assert(flagged.length === 0, 'no group still claims it was archived with the community');
});

await run('a group unarchived on its own is not re-archived by the community coming back', async () => {
  const admin = await user('unarch2-admin');
  const cid = await club(admin, 'Partial Restore Club');
  await upgradeToBasic(cid);
  const alpha = await newGroup(admin, cid, 'Alpha');

  await rpc(admin.jwt, 'archive_community', { p_community_id: cid, p_archive: true });
  await rpc(admin.jwt, 'unarchive_group', { p_group_id: alpha });      // pulled back out by hand
  assert((await archivedAt(alpha)) === null, 'Alpha is active again');

  const restored = await rpc(admin.jwt, 'archive_community', { p_community_id: cid, p_archive: false });
  assert(restored === 1, `only the general group was still to restore (got ${restored})`);
  assert((await archivedAt(alpha)) === null, 'Alpha is untouched');
});
