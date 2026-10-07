// infra/supabase/tests/discovery-departed-founder.test.mjs
// Migration 0138: a founder who leaves their community, or is removed from it, keeps nothing of it.
// Before 0138, tenant_memberships — which only ever holds a community's founder and is never cleaned
// up — decided who could find a private or request-to-join community's groups and events in Explore
// and search, read its permission toggles, plan row and tenant, and insert communities into its
// tenant; and account_plan granted the founder the community's Jammer+ whether or not they were still
// in it. Any admin could also PATCH created_by and tenant_id, the two columns the new rules rest on
// (a co-admin taking the founder's Jammer+; a departed founder pulling their old tenant back into
// reach). Each "cannot" below was true before 0138; each "can" is the legitimate view that must
// survive beside it — including the members of a non-public community, who were offered none of its
// groups or events and could not read its toggles. Every call uses a real user's JWT: the discovery
// functions are SECURITY DEFINER, so their predicates are the only fence.
import { user, rpc, req, sel, insert, expectError, assert, run, BASE_URL, ANON } from './lib.mjs';

const letters = () => Array.from({ length: 6 }, () => 'bcdfghjklmnpqrstvwxz'[Math.floor(Math.random() * 20)]).join('');
const TOK = `zq${letters()}`;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const DENIED = 'permission denied';
const communityArgs = (name, privacy) => ({
  p_name: name, p_type: 'club', p_country: 'PT', p_privacy: privacy,
  p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
  p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
});
const eventPayload = (groupId, name) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Street', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: at(3 * 864e5), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null,
});

const founder = await user('ddf-founder');
const admin2 = await user('ddf-admin2');
const member = await user('ddf-member');
const outsider = await user('ddf-outsider');

// P private, R request-to-join, U public — all founded by `founder`, all on Community Pro, which
// allows a second admin and bundles Jammer+ for the founder. admin2 and member are invited in
// properly; the founder promotes admin2 the way the app does (useMakeAdmin: an UPDATE of role).
const ids = {};
const tenant = {};
for (const [key, privacy] of [['P', 'private'], ['R', 'request_to_join'], ['U', 'public']]) {
  const cid = await rpc(founder.jwt, 'create_community_with_personal_tenant', communityArgs(`${key}c ${TOK}`, privacy));
  ids[key] = cid;
  await insert('community_subscriptions', { community_id: cid, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  await rpc(founder.jwt, 'invite_to_community', { p_community_id: cid, p_invitee_ids: [admin2.id, member.id] });
  for (const u of [admin2, member]) {
    const [inv] = await sel('community_invitations', `community_id=eq.${cid}&invitee_id=eq.${u.id}&select=id`);
    await rpc(u.jwt, 'accept_invitation', { p_invitation_id: inv.id, p_ack: true });
  }
  await req(`/rest/v1/community_members?community_id=eq.${cid}&user_id=eq.${admin2.id}`, {
    method: 'PATCH', jwt: founder.jwt, body: { role: 'admin' }, prefer: 'return=minimal',
  });
  [{ id: ids[`${key}gen`] }] = await sel('groups', `community_id=eq.${cid}&is_general=eq.true&select=id`);
  [{ tenant_id: tenant[key] }] = await sel('communities', `id=eq.${cid}&select=tenant_id`);
}
// admin2's groups — the founder is in none of them. member joins Zebra and Rhino.
const group = (cid, name) => rpc(admin2.jwt, 'create_group', {
  p_community_id: cid, p_name: `${name} ${TOK}`, p_description: null, p_is_private: false, p_thumbnail_path: null,
});
ids.zebra = await group(ids.P, 'Zebra');
ids.yak = await group(ids.P, 'Yak');
ids.rhino = await group(ids.R, 'Rhino');
ids.unicorn = await group(ids.U, 'Unicorn');
await rpc(member.jwt, 'join_group', { p_group_id: ids.zebra });
await rpc(member.jwt, 'join_group', { p_group_id: ids.rhino });
// One public upcoming event per group, organised by admin2.
const ev = {};
for (const g of ['Pgen', 'zebra', 'yak', 'Rgen', 'rhino', 'Ugen', 'unicorn']) {
  ev[g] = await rpc(admin2.jwt, 'create_event', { p_payload: eventPayload(ids[g], `Ev${g} ${TOK}`) });
}

/** Everything the four discovery calls hand this user, as id sets. */
const discover = async (u) => {
  const [sg, eg, se, ee] = await Promise.all([
    rpc(u.jwt, 'search_groups', { p_q: TOK, p_limit: 100, p_offset: 0 }),
    rpc(u.jwt, 'explore_groups', { p_limit: 1000, p_offset: 0 }),
    rpc(u.jwt, 'search_events', { p_q: TOK, p_limit: 100, p_offset: 0 }),
    rpc(u.jwt, 'explore_events', { p_limit: 1000, p_offset: 0 }),
  ]);
  return {
    searchGroups: new Set(sg.map((r) => r.id)), exploreGroups: new Set(eg.map((r) => r.id)),
    searchEvents: new Set(se.map((r) => r.event.id)), exploreEvents: new Set(ee.map((r) => r.event.id)),
  };
};
const anyOf = (set, list) => list.filter((id) => set.has(id));
/** How many rows of `table` for this community the user's own RLS lets them read (0 or 1). */
const readable = async (u, table, cid) =>
  (await req(`/rest/v1/${table}?community_id=eq.${cid}&select=community_id`, { jwt: u.jwt })).length;
const tenantReadable = async (u, tid) => (await req(`/rest/v1/tenants?id=eq.${tid}&select=id`, { jwt: u.jwt })).length;
/** The same read with the public anon key and no session. */
const anonReadable = async (table, cid) => {
  const res = await fetch(`${BASE_URL}/rest/v1/${table}?community_id=eq.${cid}&select=community_id`, { headers: { apikey: ANON } });
  assert(res.ok, `anon read of ${table} answered ${res.status}`);
  return (await res.json()).length;
};
const plan = (u) => rpc(u.jwt, 'account_plan_of_caller');
const insertCommunityInto = (u, tenantId, name) => req('/rest/v1/communities', {
  method: 'POST', jwt: u.jwt, body: { tenant_id: tenantId, name, type: 'club', privacy: 'private' }, prefer: 'return=minimal',
});
/** A direct PATCH of one community as this user — what useUpdateCommunity sends. */
const patchCommunity = (u, cid, body) => req(`/rest/v1/communities?id=eq.${cid}`, {
  method: 'PATCH', jwt: u.jwt, body, prefer: 'return=representation',
});
const communityRow = async (cid) => (await sel('communities', `id=eq.${cid}&select=created_by,tenant_id,archived_at`))[0];

const nonPublicGroups = () => [ids.Pgen, ids.zebra, ids.yak, ids.Rgen, ids.rhino];
const nonPublicEvents = () => [ev.Pgen, ev.zebra, ev.yak, ev.Rgen, ev.rhino];

// ── while the founder is still in ───────────────────────────────────────────────────────────────

await run('a founder still in is not offered events of groups they never joined (RLS hides them)', async () => {
  const d = await discover(founder);
  const hidden = [ev.zebra, ev.yak, ev.rhino];
  assert(anyOf(d.searchEvents, hidden).length === 0, 'search_events offers no event of a group the founder is not in');
  assert(anyOf(d.exploreEvents, hidden).length === 0, 'explore_events offers none either');
  // can: the events of the groups they ARE in, and the community's public groups.
  assert(d.searchEvents.has(ev.Pgen) && d.searchEvents.has(ev.Rgen), 'search_events finds events of their own groups');
  assert(d.exploreEvents.has(ev.Pgen) && d.exploreEvents.has(ev.Rgen), 'explore_events offers them');
  assert(nonPublicGroups().every((g) => d.searchGroups.has(g)), 'search_groups finds every public group of their communities');
  assert([ids.zebra, ids.yak, ids.rhino].every((g) => d.exploreGroups.has(g)), 'explore_groups offers the ones they have not joined');
});

await run('a member is offered what RLS shows them: their community\'s public groups, their groups\' events', async () => {
  const d = await discover(member);
  // cannot: an event of a group they are not in.
  assert(!d.searchEvents.has(ev.yak) && !d.exploreEvents.has(ev.yak), 'no event of Yak, a group the member is not in');
  // can: before 0138 only the founder was offered these.
  assert(d.exploreGroups.has(ids.yak) && d.searchGroups.has(ids.yak), 'Yak, a public group of their private community, is offered');
  for (const e of [ev.Pgen, ev.zebra, ev.Rgen, ev.rhino]) {
    assert(d.searchEvents.has(e) && d.exploreEvents.has(e), `event ${e} of one of the member's groups is offered`);
  }
});

await run('members read a non-public community\'s toggles; only admins read its plan row; the founder reads their tenant', async () => {
  // can: an ordinary member reads the toggles useAbility needs (before 0138 only the founder could).
  assert((await readable(member, 'community_permissions', ids.P)) === 1, 'a member reads P\'s toggles');
  assert((await readable(member, 'community_permissions', ids.R)) === 1, 'a member reads R\'s toggles');
  // The plan row is not widened to members — nothing in the apps reads it; admins can change the plan.
  assert((await readable(member, 'community_subscriptions', ids.P)) === 0, 'a member does not read P\'s plan row');
  assert((await readable(admin2, 'community_subscriptions', ids.P)) === 1
    && (await readable(admin2, 'community_subscriptions', ids.R)) === 1, 'a promoted admin reads the plan rows');
  assert((await readable(founder, 'community_subscriptions', ids.P)) === 1, 'the founder, an admin, reads P\'s plan row');
  assert((await tenantReadable(founder, tenant.P)) === 1, 'the founder reads P\'s tenant while still in');
  assert((await tenantReadable(member, tenant.P)) === 0, 'a member does not read the founder\'s tenant');
  // cannot: an outsider, for P and R; can: anyone signed in, for the public U.
  assert((await readable(outsider, 'community_permissions', ids.P)) === 0, 'an outsider cannot read P\'s toggles');
  assert((await readable(outsider, 'community_subscriptions', ids.R)) === 0, 'an outsider cannot read R\'s plan row');
  assert((await readable(outsider, 'community_permissions', ids.U)) === 1
    && (await readable(outsider, 'community_subscriptions', ids.U)) === 1, 'anyone signed in reads a public community\'s rows');
  // anon gains nothing from the per-row helpers: no session, no rows, not even U's.
  assert((await anonReadable('community_permissions', ids.U)) === 0
    && (await anonReadable('community_subscriptions', ids.U)) === 0, 'anon reads no toggles or plan rows');
});

await run('nobody inserts or deletes a community directly; admins edit the settings columns and nothing else', async () => {
  await expectError(() => insertCommunityInto(founder, tenant.P, `Trojan ${TOK}`), DENIED);
  await expectError(() => req(`/rest/v1/communities?id=eq.${ids.U}`, { method: 'DELETE', jwt: admin2.jwt }), DENIED);
  assert((await sel('communities', `id=eq.${ids.U}&select=id`)).length === 1, 'U still exists');
  assert((await sel('communities', `name=eq.${encodeURIComponent(`Trojan ${TOK}`)}&select=id`)).length === 0, 'no community was inserted');
  // can: useUpdateCommunity's PATCH, with every column it (or the web create page) ever sends —
  // a column missing from 0138's UPDATE grant fails here. Values other than description are U's
  // own, so U stays public for the tests below.
  const rows = await patchCommunity(admin2, ids.U, {
    name: `Uc ${TOK}`, description: `edited ${TOK}`, location: 'Lisbon, PT', type: 'club', privacy: 'public',
    thumbnail_path: null, cover_image_path: null, cancellation_rules_enabled: false, cancellation_rules_text: null,
  });
  assert(rows.length === 1 && rows[0].description === `edited ${TOK}`, 'an admin still edits the community');
  // cannot: the columns only definer functions and triggers write.
  const before = await communityRow(ids.U);
  await expectError(() => patchCommunity(admin2, ids.U, { tenant_id: tenant.P }), DENIED);
  await expectError(() => patchCommunity(admin2, ids.U, { archived_at: new Date().toISOString() }), DENIED);
  const after = await communityRow(ids.U);
  assert(after.tenant_id === before.tenant_id && after.archived_at === null, 'U is neither moved nor archived');
});

await run('the founder holds the Jammer+ their communities bundle; nobody else gets it from them', async () => {
  assert((await plan(founder)) === 'jammer_plus', 'the founder has Jammer+ from Community Pro');
  assert((await plan(admin2)) === 'free', 'a promoted admin does not');
  assert((await plan(member)) === 'free', 'a member does not');
  // cannot: a co-admin who rewrites created_by would pass account_plan's rule (they are a member) —
  // so created_by is not theirs to write.
  await expectError(() => patchCommunity(admin2, ids.U, { created_by: admin2.id }), DENIED);
  assert((await communityRow(ids.U)).created_by === founder.id, 'U\'s founder is unchanged');
  assert((await plan(admin2)) === 'free', 'the co-admin still has no Jammer+');
  assert((await plan(founder)) === 'jammer_plus', 'and the founder keeps theirs');
});

// ── the founder goes ────────────────────────────────────────────────────────────────────────────

await run('a founder who leaves a private community, or is removed from a request-to-join one, no longer finds them', async () => {
  await rpc(founder.jwt, 'leave_community', { p_community_id: ids.P });
  await rpc(admin2.jwt, 'remove_member', { p_community_id: ids.R, p_user_id: founder.id });
  // The leftover that used to let them in is still there — the fix does not depend on it going.
  assert((await sel('tenant_memberships', `user_id=eq.${founder.id}&select=tenant_id`)).length === 3, 'tenant_memberships untouched');

  const d = await discover(founder);
  assert(anyOf(d.searchGroups, nonPublicGroups()).length === 0, `search_groups finds none of P's or R's groups, got ${anyOf(d.searchGroups, nonPublicGroups())}`);
  assert(anyOf(d.exploreGroups, nonPublicGroups()).length === 0, 'explore_groups offers none of them');
  assert(anyOf(d.searchEvents, nonPublicEvents()).length === 0, 'search_events finds none of their events');
  assert(anyOf(d.exploreEvents, nonPublicEvents()).length === 0, 'explore_events offers none of their events');
  const suggest = await rpc(founder.jwt, 'search_suggest', { p_q: TOK, p_limit: 20 });
  assert(!suggest.some((s) => nonPublicGroups().includes(s.id) || nonPublicEvents().includes(s.id)), 'search_suggest suggests none of them');

  // can: the people still in keep finding all of it.
  const a = await discover(admin2);
  assert(nonPublicGroups().every((g) => a.searchGroups.has(g)), 'the remaining admin still finds every group');
  const m = await discover(member);
  assert(nonPublicGroups().every((g) => m.searchGroups.has(g)), 'the member still finds every public group');
  assert([ev.Pgen, ev.zebra, ev.Rgen, ev.rhino].every((e) => m.searchEvents.has(e)), 'the member still finds their groups\' events');
});

await run('a founder who left loses the toggles, plan row and tenant — and cannot insert into the old tenant', async () => {
  assert((await readable(founder, 'community_permissions', ids.P)) === 0, 'P\'s toggles are gone');
  assert((await readable(founder, 'community_subscriptions', ids.P)) === 0, 'P\'s plan row is gone');
  assert((await readable(founder, 'community_permissions', ids.R)) === 0, 'R\'s toggles are gone');
  assert((await tenantReadable(founder, tenant.P)) === 0 && (await tenantReadable(founder, tenant.R)) === 0, 'P\'s and R\'s tenants are gone');
  await expectError(() => insertCommunityInto(founder, tenant.P, `Trojan2 ${TOK}`), DENIED);
  // Nor by moving U — which they still admin — onto P's tenant: "tenants: read own" would count
  // their membership of U as membership of a community on P's tenant.
  await expectError(() => patchCommunity(founder, ids.U, { tenant_id: tenant.P }), DENIED);
  assert((await communityRow(ids.U)).tenant_id === tenant.U, 'U stays on its own tenant');
  assert((await tenantReadable(founder, tenant.P)) === 0, 'P\'s tenant stays out of reach');
  // can: their own tenant of a community they are still in, and the people still in keep reading.
  assert((await tenantReadable(founder, tenant.U)) === 1, 'U\'s tenant, while still in U');
  assert((await readable(admin2, 'community_permissions', ids.P)) === 1
    && (await readable(member, 'community_permissions', ids.R)) === 1
    && (await readable(admin2, 'community_subscriptions', ids.R)) === 1, 'the remaining admin and member still read them');
});

await run('the founder\'s Jammer+ lasts while they are in one of their communities, and ends when they are in none', async () => {
  // Still in U (Community Pro): still Jammer+.
  assert((await plan(founder)) === 'jammer_plus', 'still Jammer+ through U');
  await rpc(founder.jwt, 'leave_community', { p_community_id: ids.U });
  assert((await plan(founder)) === 'free', 'Jammer+ ends once they are a member of none of them');
  // A Jammer+ of their own is untouched by any of this.
  await rpc(founder.jwt, 'set_account_plan', { p_plan: 'jammer_plus' });
  assert((await plan(founder)) === 'jammer_plus', 'their own subscription still counts');
  await rpc(founder.jwt, 'set_account_plan', { p_plan: 'free' });
  assert((await plan(founder)) === 'free', 'and goes when they cancel it');
});

await run('a founder who leaves a PUBLIC community still finds it — it is public', async () => {
  const d = await discover(founder);
  assert(d.searchGroups.has(ids.Ugen) && d.searchGroups.has(ids.unicorn), 'search_groups still finds U\'s groups');
  assert(d.exploreGroups.has(ids.unicorn), 'explore_groups still offers them');
  assert(d.searchEvents.has(ev.Ugen) && d.searchEvents.has(ev.unicorn), 'search_events still finds U\'s events');
  assert(d.exploreEvents.has(ev.unicorn), 'explore_events still offers them');
  const o = await discover(outsider);
  assert(o.searchGroups.has(ids.unicorn) && o.searchEvents.has(ev.unicorn), 'and so does anyone signed in');
  assert(anyOf(o.searchGroups, nonPublicGroups()).length === 0 && anyOf(o.searchEvents, nonPublicEvents()).length === 0,
    'while an outsider never finds P or R');
});
