// infra/supabase/tests/event-roster-integrity.test.mjs
//
// Migration 0111 (UX Audit — Events, plan PR 1, bugs B1–B6), through PostgREST as the signed-in
// user — the path every one of those bugs was open on.
import { user, rpc, anonRpc, req, sel, insert, patch, expectError, assert, run } from './lib.mjs';

const ZERO = '00000000-0000-0000-0000-000000000000';
const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();

const teamEvent = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'team', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: 'Roster Integrity', venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 2, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: 0, is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const invitees = (...us) => us.map((u) => ({ invitee_id: u.id, name: null, email: null, phone: null }));

/** A standalone private team event (no group, so no community needed) with the given invitees. */
async function privateEvent(org, list, over = {}) {
  return rpc(org.jwt, 'create_event', { p_payload: teamEvent(null, { is_private: true, invitees: invitees(...list), ...over }) });
}

/** Organizer + community on Pro + a public group with `members` in it before the event exists. */
async function publicGroup(tag, members) {
  const admin = await user(`${tag}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Roster ${tag} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const groupId = await rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Public', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });
  const join = async (u) => {
    await insert('community_members', { community_id: communityId, user_id: u.id, role: 'member' });
    await rpc(u.jwt, 'join_group', { p_group_id: groupId, p_ack: true });
  };
  for (const u of members) await join(u);
  return { admin, groupId, join };
}

const requestRow = (eventId, from, to) =>
  sel('partner_requests', `event_id=eq.${eventId}&requester_id=eq.${from.id}&target_id=eq.${to.id}&select=id,status`)
    .then((r) => r[0] ?? null);
const teams = (eventId) => sel('event_teams', `event_id=eq.${eventId}&select=id,player_a_id,player_b_id`);
const block = (blocker, blocked) => insert('blocks', { blocker_id: blocker.id, blocked_id: blocked.id });

await run('B1: choose_partner rejects an outsider, an unknown id, yourself and a blocked user', async () => {
  const [org, a, b, outsider] = [await user('b1-org'), await user('b1-a'), await user('b1-b'), await user('b1-out')];
  const ev = await privateEvent(org, [a, b]);
  await expectError(() => rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: outsider.id }), 'partner_unavailable');
  await expectError(() => rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: ZERO }), 'partner_unavailable');
  await expectError(() => rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: a.id }), 'partner_unavailable');
  await block(b, a); // either direction counts: b blocked a, a is the one asking
  await expectError(() => rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: b.id }), 'partner_unavailable');
  assert((await teams(ev)).length === 0, 'no team was formed');
});

await run('B1: no second team, no pairing with someone already paired', async () => {
  const [org, a, b, c, d] = [await user('b1p-org'), await user('b1p-a'), await user('b1p-b'), await user('b1p-c'), await user('b1p-d')];
  const ev = await privateEvent(org, [a, b, c, d]);
  await rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: b.id });
  await expectError(() => rpc(c.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: b.id }), 'partner_unavailable');
  await expectError(() => rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: c.id }), 'already_joined');
  await rpc(c.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: d.id });
  assert((await teams(ev)).length === 2, 'exactly two teams');
});

await run('B1: on a public group event a member who joined later is eligible', async () => {
  const [a, b] = [await user('b1g-a'), await user('b1g-b')];
  const { admin, groupId, join } = await publicGroup('b1g', [a]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: teamEvent(groupId) });
  await join(b); // not invited: joined the group after the event was created
  await expectError(() => rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: admin.id }), 'partner_unavailable');
  await rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: b.id });
  assert((await teams(ev)).length === 1, 'the pair is a team');
});

await run('B2: inside the 6 h cut-off, every self-join path is closed', async () => {
  const [org, a, b, c] = [await user('b2-org'), await user('b2-a'), await user('b2-b'), await user('b2-c')];
  const ev = await privateEvent(org, [a, b, c]);
  await rpc(c.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] });
  const req1 = await requestRow(ev, c, b);
  await patch('events', `id=eq.${ev}`, { starts_at: hoursFromNow(5) });

  await expectError(() => rpc(a.jwt, 'accept_event_invitation', { p_event_id: ev }), 'event_closed');
  await expectError(() => rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: b.id }), 'event_closed');
  await expectError(() => rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] }), 'event_closed');
  await expectError(() => rpc(b.jwt, 'accept_partner_request', { p_request_id: req1.id }), 'event_closed');

  // …and a classic event's invitation too, and a cancelled event whatever its date.
  const classic = await privateEvent(org, [a], { specification: 'classic', starts_at: hoursFromNow(5) });
  await expectError(() => rpc(a.jwt, 'accept_event_invitation', { p_event_id: classic }), 'event_closed');
  const far = await privateEvent(org, [a, b]);
  await patch('events', `id=eq.${far}`, { status: 'cancelled' });
  await expectError(() => rpc(a.jwt, 'choose_partner', { p_event_id: far, p_partner_user: b.id }), 'event_closed');
});

await run('B3: accepting closes the accepter\'s other incoming and outgoing requests', async () => {
  const [org, r1, r2, t, x] = [await user('b3-org'), await user('b3-r1'), await user('b3-r2'), await user('b3-t'), await user('b3-x')];
  const ev = await privateEvent(org, [r1, r2, t, x]);
  await rpc(r1.jwt, 'request_partner', { p_event_id: ev, p_targets: [t.id, x.id] });
  await rpc(r2.jwt, 'request_partner', { p_event_id: ev, p_targets: [t.id] });
  await rpc(t.jwt, 'request_partner', { p_event_id: ev, p_targets: [x.id] });
  const accepted = await requestRow(ev, r1, t);
  await rpc(t.jwt, 'accept_partner_request', { p_request_id: accepted.id });

  assert((await requestRow(ev, r1, t)).status === 'accepted', 'the accepted one');
  assert((await requestRow(ev, r2, t)).status === 'declined', "the accepter's other incoming request");
  assert((await requestRow(ev, t, x)).status === 'declined', "the accepter's own outgoing request");
  assert((await requestRow(ev, r1, x)).status === 'declined', "the requester's other request (as before)");
  await expectError(() => rpc(t.jwt, 'accept_partner_request', { p_request_id: accepted.id }), 'request_not_found');
  await expectError(() => rpc(t.jwt, 'decline_partner_request', { p_request_id: accepted.id }), 'request_not_found');
  assert((await teams(ev)).length === 1, 'one team');
});

await run('B3: a stale request (requester gone or blocked) raises request_stale', async () => {
  const [org, r, t, r2, t2] = [await user('b3s-org'), await user('b3s-r'), await user('b3s-t'), await user('b3s-r2'), await user('b3s-t2')];
  const ev = await privateEvent(org, [r, t, r2, t2]);
  await rpc(r.jwt, 'request_partner', { p_event_id: ev, p_targets: [t.id] });
  // What a pre-0111 leave_event left behind: the requester's row is gone, the request is not.
  await req(`/rest/v1/event_participants?event_id=eq.${ev}&user_id=eq.${r.id}`, { method: 'DELETE' });
  const stale = await requestRow(ev, r, t);
  await expectError(() => rpc(t.jwt, 'accept_partner_request', { p_request_id: stale.id }), 'request_stale');

  await rpc(r2.jwt, 'request_partner', { p_event_id: ev, p_targets: [t2.id] });
  await block(t2, r2);
  const blocked = await requestRow(ev, r2, t2);
  await expectError(() => rpc(t2.jwt, 'accept_partner_request', { p_request_id: blocked.id }), 'request_stale');
  assert((await teams(ev)).length === 0, 'no team from a stale request');
});

await run('B4: leaving withdraws the requests you sent', async () => {
  const [org, r, t] = [await user('b4-org'), await user('b4-r'), await user('b4-t')];
  const ev = await privateEvent(org, [r, t]);
  await rpc(r.jwt, 'request_partner', { p_event_id: ev, p_targets: [t.id] });
  const pending = await requestRow(ev, r, t);
  await rpc(r.jwt, 'leave_event', { p_event_id: ev });
  assert((await requestRow(ev, r, t)) === null, 'the request is gone');
  await expectError(() => rpc(t.jwt, 'accept_partner_request', { p_request_id: pending.id }), 'request_not_found');
  const p = await sel('event_participants', `event_id=eq.${ev}&user_id=eq.${r.id}&select=id`);
  assert(p.length === 0, 'the leaver was not re-confirmed');
});

await run('B5: the target cannot PATCH a request; only the requester can withdraw it', async () => {
  const [org, r, t] = [await user('b5-org'), await user('b5-r'), await user('b5-t')];
  const ev = await privateEvent(org, [r, t]);
  await rpc(r.jwt, 'request_partner', { p_event_id: ev, p_targets: [t.id] });
  const pr = await requestRow(ev, r, t);

  try {
    await req(`/rest/v1/partner_requests?id=eq.${pr.id}`, { method: 'PATCH', jwt: t.jwt, body: { status: 'accepted' } });
  } catch { /* permission denied is the expected shape; an RLS no-op would be too */ }
  assert((await requestRow(ev, r, t)).status === 'pending', 'a direct PATCH changes nothing');

  await expectError(() => rpc(t.jwt, 'withdraw_partner_request', { p_request_id: pr.id }), 'request_not_found');
  await rpc(r.jwt, 'withdraw_partner_request', { p_request_id: pr.id });
  assert((await requestRow(ev, r, t)) === null, 'withdrawn');
  await expectError(() => rpc(r.jwt, 'withdraw_partner_request', { p_request_id: pr.id }), 'request_not_found');

  // Withdrawing deletes, so asking the same person again works.
  await rpc(r.jwt, 'request_partner', { p_event_id: ev, p_targets: [t.id] });
  assert((await requestRow(ev, r, t))?.status === 'pending', 'asked again');
});

await run('B6: candidates exclude self, organizer, blocked (either way), paired and outsiders', async () => {
  const [a, b, c, d, e, f, late] = [
    await user('b6-a'), await user('b6-b'), await user('b6-c'), await user('b6-d'),
    await user('b6-e'), await user('b6-f'), await user('b6-late'),
  ];
  const outsider = await user('b6-out');
  const { admin, groupId, join } = await publicGroup('b6', [a, b, c, d, e, f]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: teamEvent(groupId) });
  await join(late);
  await block(a, c);                                                     // a blocked c
  await block(d, a);                                                     // d blocked a
  await rpc(e.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: f.id }); // e + f paired

  const ids = (await rpc(a.jwt, 'event_partner_candidates', { p_event_id: ev })).map((r) => r.id);
  assert(ids.includes(b.id) && ids.includes(late.id), `b and the late member are candidates, got ${ids.length}`);
  for (const [who, u] of [['self', a], ['organizer', admin], ['blocked', c], ['blocker', d], ['paired e', e], ['paired f', f], ['outsider', outsider]]) {
    assert(!ids.includes(u.id), `${who} is not a candidate`);
  }
  // request_partner applies the same filter: blocked targets are skipped silently.
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id, c.id, d.id, e.id] });
  const sent = await sel('partner_requests', `event_id=eq.${ev}&requester_id=eq.${a.id}&select=target_id`);
  assert(sent.length === 1 && sent[0].target_id === b.id, `only b was asked, got ${sent.length}`);

  // The event is visible to any signed-in user (public community preview), but the list is not.
  await expectError(() => rpc(outsider.jwt, 'event_partner_candidates', { p_event_id: ev }), 'forbidden');
  await expectError(() => rpc(outsider.jwt, 'event_partner_candidates', { p_event_id: ZERO }), 'event_not_found');
});

await run('grants: the new helpers are closed, the new RPCs are signed-in only', async () => {
  const stranger = await user('grants');
  for (const [name, args] of [
    ['_assert_can_confirm', { p_event_id: ZERO }],
    ['_is_paired_or_waiting', { p_event_id: ZERO, p_user: ZERO }],
    ['_partner_available', { p_event_id: ZERO, p_caller: ZERO, p_user: ZERO }],
  ]) {
    await expectError(() => rpc(stranger.jwt, name, args), 'permission denied for function');
    await expectError(() => anonRpc(name, args), 'permission denied for function');
  }
  await expectError(() => anonRpc('withdraw_partner_request', { p_request_id: ZERO }), 'permission denied for function');
  await expectError(() => anonRpc('event_partner_candidates', { p_event_id: ZERO }), 'permission denied for function');
  await expectError(() => rpc(stranger.jwt, 'withdraw_partner_request', { p_request_id: ZERO }), 'request_not_found');
});
