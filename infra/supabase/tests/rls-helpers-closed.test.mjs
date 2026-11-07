// infra/supabase/tests/rls-helpers-closed.test.mjs
//
// Migration 0159 (PAD-160): the RLS helpers stop answering outsiders. Before it, anyone with the
// publishable key could ask whether a user organises or can see a private event
// (is_event_organizer / event_is_visible, any user id) and which community a private group sits in
// (group_community_id). The fix moved the 43 policies that call the helpers to `authenticated`,
// pinned the two event helpers to the caller, and revoked anon's EXECUTE.
//
// The test that matters most is "anon reads don't error": a bare revoke without the policy move
// turns anon's empty read into 42501, which is what 0094-0136 each kept the grants to avoid.
import { BASE_URL, ANON, setAccountPlan, user, rpc, anonRpc, sel, insert, patch, req, expectError, assert, run } from './lib.mjs';

const DENIED = 'permission denied for function';
const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);
const ZERO = '00000000-0000-0000-0000-000000000000';

const asAnon = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, text, json: text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null };
};
const selAs = (jwt, table, qs) => req(`/rest/v1/${table}?${qs}`, { jwt });

const eventPayload = (over = {}) => ({
  group_id: null, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Helpers ${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: true, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});

const A = await user('rh-a');
const B = await user('rh-b'); // a stranger to everything of A's
await setAccountPlan(A.id, 'jammer_plus');
const ev = await rpc(A.jwt, 'create_event', { p_payload: eventPayload() });
const cid = await rpc(A.jwt, 'create_community_with_personal_tenant', {
  p_name: `Helpers Club ${tag()}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
  p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
  p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
});
await insert('community_subscriptions', { community_id: cid, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
const grp = await rpc(A.jwt, 'create_group', { p_community_id: cid, p_name: 'Vault', p_description: null, p_is_private: true, p_thumbnail_path: null });

await run('anon is refused by all eleven helpers and the new one', async () => {
  const calls = [
    ['auth_tenant_ids', {}], ['can_create_post', { c: ZERO }], ['community_is_public', { c: ZERO }],
    ['is_community_admin', { c: ZERO }], ['is_community_member', { c: ZERO }], ['is_group_admin', { g: ZERO, u: ZERO }],
    ['is_group_member', { g: ZERO }], ['may_approve_requests', { c: ZERO }],
    ['event_is_visible', { e: ev, u: A.id }], ['is_event_organizer', { e: ev, u: A.id }],
    ['group_community_id', { g: grp }], ['is_community_admin_of_group', { g: grp }],
  ];
  for (const [name, args] of calls) await expectError(() => anonRpc(name, args), DENIED);
});

await run('a stranger learns nothing about A\'s private event or group', async () => {
  assert((await rpc(B.jwt, 'is_event_organizer', { e: ev, u: A.id })) === false, 'is_event_organizer(A) is false for B');
  assert((await rpc(B.jwt, 'event_is_visible', { e: ev, u: A.id })) === false, 'event_is_visible(A) is false for B');
  assert((await rpc(B.jwt, 'is_event_organizer', { e: ev, u: B.id })) === false, 'B is no organiser');
  assert((await rpc(B.jwt, 'event_is_visible', { e: ev, u: B.id })) === false, 'B cannot see it');
  // A real false, not NULL: callers are written `if not is_event_organizer(...) then raise`.
  assert((await rpc(B.jwt, 'is_event_organizer', { e: ev, u: null })) === false, 'u null gives false, not null');
  assert((await rpc(B.jwt, 'event_is_visible', { e: ev, u: null })) === false, 'u null gives false, not null');
  assert((await rpc(null, 'is_event_organizer', { e: ev, u: A.id })) === false, 'no session: false, not null');
  await expectError(() => rpc(B.jwt, 'group_community_id', { g: grp }), DENIED);
});

await run('A still gets true about their own event', async () => {
  assert((await rpc(A.jwt, 'is_event_organizer', { e: ev, u: A.id })) === true, 'organiser');
  assert((await rpc(A.jwt, 'event_is_visible', { e: ev, u: A.id })) === true, 'visible');
  assert((await rpc(A.jwt, 'is_event_organizer', { e: ev, u: B.id })) === false, 'A cannot ask about B either');
});

await run('anon reads do not error: 200 and empty on every table whose policy moved', async () => {
  const tables = ['communities', 'community_invitations', 'community_join_requests', 'community_members',
    'community_permissions', 'community_posts', 'community_reviews', 'community_subscriptions', 'delivery_log',
    'event_activity', 'event_blasts', 'event_courts', 'event_invitations', 'event_matches', 'event_participants',
    'event_rounds', 'event_teams', 'event_timer', 'events', 'group_departures', 'group_event_results',
    'group_invitations', 'group_members', 'group_seasons', 'groups', 'match_players', 'partner_requests',
    'post_comments', 'post_likes', 'round_rest', 'tenants'];
  for (const t of tables) {
    const r = await asAnon(`/rest/v1/${t}?select=*&limit=1`);
    assert(r.status === 200, `anon GET ${t} is ${r.status}: ${r.text.slice(0, 120)}`);
    assert(Array.isArray(r.json) && r.json.length === 0, `anon GET ${t} returned rows`);
  }
});

await run('every table PostgREST exposes: anon never gets "permission denied for function"', async () => {
  const spec = await (await fetch(`${BASE_URL}/rest/v1/`, { headers: { apikey: ANON } })).json();
  const tables = Object.keys(spec.paths ?? {}).filter((p) => p !== '/' && !p.startsWith('/rpc/')).map((p) => p.slice(1));
  assert(tables.length > 30, `found ${tables.length} tables`);
  for (const t of tables) {
    const r = await asAnon(`/rest/v1/${t}?select=*&limit=1`);
    assert(!/permission denied for function/.test(r.text), `anon GET ${t}: ${r.text.slice(0, 160)}`);
  }
});

await run('anon writes are unchanged: no rows changed, insert refused', async () => {
  const p = await asAnon(`/rest/v1/communities?id=eq.${cid}`, { method: 'PATCH', body: { name: 'hijack' } });
  assert(!(Array.isArray(p.json) && p.json.length > 0), 'anon PATCH changed a community');
  assert((await sel('communities', `id=eq.${cid}&select=name`))[0].name !== 'hijack', 'name untouched');
  const i = await asAnon('/rest/v1/community_posts', { method: 'POST', body: { community_id: cid, author_id: A.id, body: 'x' } });
  assert(i.status >= 400, `anon INSERT on community_posts should be refused, got ${i.status}`);
});

await run('organiser-gated action works for the organiser, not a stranger or a session-less caller', async () => {
  await rpc(A.jwt, 'mark_all_paid', { p_event_id: ev });
  await expectError(() => rpc(B.jwt, 'mark_all_paid', { p_event_id: ev }), 'forbidden');
  await expectError(() => anonRpc('mark_all_paid', { p_event_id: ev }), DENIED);
  let refused = false;
  try { await rpc(null, 'mark_all_paid', { p_event_id: ev }); } catch { refused = true; }
  assert(refused, 'service role (no auth.uid()) must not pass the organiser check');
});

await run('group_members stays correct: community admin reads a private group they are not in; a member does not', async () => {
  const admin2 = await user('rh-admin2');
  const member = await user('rh-member');
  await insert('community_members', { community_id: cid, user_id: admin2.id, role: 'admin' });
  await rpc(member.jwt, 'join_community', { p_community_id: cid, p_ack: false });
  const rows = (jwt) => selAs(jwt, 'group_members', `group_id=eq.${grp}&select=user_id`);
  assert((await rows(A.jwt)).length >= 1, 'the group admin reads members');
  assert((await rows(admin2.jwt)).length >= 1, 'a community admin outside the group reads members');
  assert((await rows(member.jwt)).length === 0, 'a plain community member does not');
  assert((await rows(B.jwt)).length === 0, 'a stranger does not');
  assert((await selAs(admin2.jwt, 'group_departures', `group_id=eq.${grp}&select=group_id`)).length >= 0, 'departures readable without error');
  await rpc(A.jwt, 'archive_group', { p_group_id: grp });
  await rpc(A.jwt, 'unarchive_group', { p_group_id: grp });
});
