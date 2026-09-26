// infra/supabase/tests/event-join-rules.test.mjs
//
// Migration 0112 (UX Audit — Events, plan PR 2): waiting-list broadcast and queueing (D4, B8), no
// invitations for public group events (D5), public team events open to the group (B7), waiting
// pairs (D6), mixed per-gender capacity (D8), partner_left + invitation reset (D1, B10), my_events
// tabs, event_invited_players, and the 0111 review follow-ups (R1, R2, R3, R6). Through PostgREST as
// the signed-in user, like every RPC the app calls.
import { user, rpc, anonRpc, sel, insert, patch, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();

const base = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: 'Join Rules', venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const invitees = (...us) => us.map((u) => ({ invitee_id: u.id, name: null, email: null, phone: null }));

/** A standalone private event (no group) with the given invitees. Capacity 4 by default. */
const privateEvent = (org, list, over = {}) =>
  rpc(org.jwt, 'create_event', { p_payload: base(null, { is_private: true, invitees: invitees(...list), ...over }) });

/** Organizer + community on Pro + a public group with `members` in it before any event exists. */
async function publicGroup(tag, members) {
  const admin = await user(`${tag}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `JoinRules ${tag} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
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
  return { admin, groupId, communityId, join };
}

const part = (ev, u) =>
  sel('event_participants', `event_id=eq.${ev}&user_id=eq.${u.id}&select=id,status,waiting_list_position,pair_participant_id`)
    .then((r) => r[0] ?? null);
const invitation = (ev, u) =>
  sel('event_invitations', `event_id=eq.${ev}&invitee_id=eq.${u.id}&select=id,status`).then((r) => r[0] ?? null);
const notifs = (u, type, ev) =>
  sel('notifications', `user_id=eq.${u.id}&type=eq.${type}&event_id=eq.${ev}&select=id,cta_done,read_at,actor_id`);
const teams = (ev) => sel('event_teams', `event_id=eq.${ev}&select=id,player_a_id,player_b_id,is_confirmed`);
const requestRow = (ev, from, to) =>
  sel('partner_requests', `event_id=eq.${ev}&requester_id=eq.${from.id}&target_id=eq.${to.id}&select=id,status,closed_by_system`)
    .then((r) => r[0] ?? null);
const block = (blocker, blocked) => insert('blocks', { blocker_id: blocker.id, blocked_id: blocked.id });

// ---------------------------------------------------------------------------------------------
// D4 + B8: queue first
// ---------------------------------------------------------------------------------------------

await run('B8: a newcomer queues behind waiters even when a spot is free (join and accept)', async () => {
  const us = [];
  for (const i of [0, 1, 2, 3, 4, 5, 6]) us.push(await user(`b8-${i}`));
  const org = await user('b8-org');
  const ev = await privateEvent(org, us); // capacity 4, every player invited
  for (const u of us.slice(0, 4)) await rpc(u.jwt, 'join_event', { p_event_id: ev });
  assert((await rpc(us[4].jwt, 'join_event', { p_event_id: ev })) === 'waiting_list', 'fifth waits (full)');
  await rpc(us[0].jwt, 'leave_event', { p_event_id: ev }); // a spot is free now, us[4] still waits
  assert((await rpc(us[5].jwt, 'join_event', { p_event_id: ev })) === 'waiting_list', 'join queues behind the waiter');
  assert((await rpc(us[6].jwt, 'accept_event_invitation', { p_event_id: ev })) === 'waiting_list', 'accept queues too');
  const rows = await sel('event_participants', `event_id=eq.${ev}&status=eq.waiting_list&select=user_id,waiting_list_position&order=waiting_list_position`);
  assert(rows.map((r) => r.user_id).join() === [us[4], us[5], us[6]].map((u) => u.id).join(), 'queue order kept, newcomers at the end');
  // Nobody is confirmed automatically; the free spot stays free until someone claims it.
  const confirmed = await sel('event_participants', `event_id=eq.${ev}&status=eq.confirmed&select=id`);
  assert(confirmed.length === 3, `3 confirmed, got ${confirmed.length}`);
  // First-come: the LAST in the queue claims it.
  assert((await rpc(us[6].jwt, 'claim_waitlist_spot', { p_event_id: ev })) === 'confirmed', 'any waiter may claim');
  await expectError(() => rpc(us[4].jwt, 'claim_waitlist_spot', { p_event_id: ev }), 'spot_taken');
  // Every waiter was offered the free spot — us[4] when it freed, and us[5] / us[6] the moment B8
  // queued them next to it (review: a newcomer queued while a spot is free is offered it too). With
  // the event full again the unclaimed offers are stale: marked read (not done), so the next spot
  // re-notifies.
  for (const u of [us[4], us[5]]) {
    const n = await notifs(u, 'waitlist_spot', ev);
    assert(n.length === 1 && n[0].read_at && !n[0].cta_done, 'stale offer marked read, not done');
  }
  await rpc(us[1].jwt, 'leave_event', { p_event_id: ev });
  for (const u of [us[4], us[5]]) assert((await notifs(u, 'waitlist_spot', ev)).length === 2, 'a fresh offer for the next spot');
});

// ---------------------------------------------------------------------------------------------
// D5: public group events send no invitations
// ---------------------------------------------------------------------------------------------

await run('D5: a public group event invites nobody and notifies every member but the organizer', async () => {
  const [a, b, blocker] = [await user('d5-a'), await user('d5-b'), await user('d5-blk')];
  const { admin, groupId } = await publicGroup('d5', [a, b, blocker]);
  await block(blocker, admin);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { invitees: invitees(a) }) });
  assert((await sel('event_invitations', `event_id=eq.${ev}&select=id`)).length === 0, 'no invitations, invitees ignored');
  for (const u of [a, b]) {
    const n = await notifs(u, 'event_created', ev);
    assert(n.length === 1 && n[0].actor_id === admin.id, 'member told, organizer as actor');
  }
  assert((await notifs(blocker, 'event_created', ev)).length === 0, 'a blocked pair is not notified');
  assert((await notifs(admin, 'event_created', ev)).length === 0, 'organizer not notified');
  assert((await rpc(a.jwt, 'join_event', { p_event_id: ev })) === 'confirmed', 'members simply join');
  await expectError(() => rpc(b.jwt, 'accept_event_invitation', { p_event_id: ev }), 'invitation_not_found');
});

await run('D5: a public occurrence copies no invitations; a private one still does', async () => {
  const [a, b] = [await user('d5m-a'), await user('d5m-b')];
  const { admin, groupId } = await publicGroup('d5m', [a, b]);
  const series = { day_of_week: 3, start_time: '19:00', duration_minutes: 90, invite_lead_days: 3 };
  const pub = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series }) });
  const next = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: pub });
  assert((await sel('event_invitations', `event_id=eq.${next}&select=id`)).length === 0, 'public occurrence: no invitations');
  assert((await notifs(a, 'event_created', next)).length === 1, 'public occurrence: group told');
  const dup = await rpc(admin.jwt, 'duplicate_event', { p_event_id: pub, p_overrides: { starts_at: hoursFromNow(200) } });
  assert((await sel('event_invitations', `event_id=eq.${dup}&select=id`)).length === 0, 'public duplicate: no invitations');
  assert((await notifs(b, 'event_created', dup)).length === 1, 'public duplicate: group told');

  const priv = await rpc(admin.jwt, 'create_event', {
    p_payload: base(groupId, { is_private: true, invitees: invitees(a), series: { ...series, day_of_week: 4 } }),
  });
  const privNext = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: priv });
  const inv = await sel('event_invitations', `event_id=eq.${privNext}&select=invitee_id,status`);
  assert(inv.length === 1 && inv[0].invitee_id === a.id && inv[0].status === 'pending', 'private occurrence keeps its invitation');
  assert((await notifs(b, 'event_created', privNext)).length === 0, 'private occurrence tells nobody');
});

// ---------------------------------------------------------------------------------------------
// B7 / R3: public team events are open to the whole group
// ---------------------------------------------------------------------------------------------

await run('B7: a member who joined the group after the event can request, choose and list partners', async () => {
  const [a, b, late, late2] = [await user('b7-a'), await user('b7-b'), await user('b7-late'), await user('b7-late2')];
  const { admin, groupId, join } = await publicGroup('b7', [a, b]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { specification: 'team' }) });
  await join(late);
  await join(late2);
  const cands = await rpc(late.jwt, 'event_partner_candidates', { p_event_id: ev });
  assert(cands.some((c) => c.id === a.id) && cands.some((c) => c.id === late2.id), 'candidates open to a late member');
  await rpc(late.jwt, 'request_partner', { p_event_id: ev, p_targets: [a.id] });
  assert((await requestRow(ev, late, a))?.status === 'pending', 'late member asked');
  assert((await rpc(late2.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: b.id })) === 'confirmed', 'late member chose');
  const outsider = await user('b7-out');
  await expectError(() => rpc(outsider.jwt, 'request_partner', { p_event_id: ev, p_targets: [a.id] }), 'forbidden');
  await expectError(() => rpc(outsider.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: a.id }), 'forbidden');
});

// ---------------------------------------------------------------------------------------------
// D6: interested players stay interested; pairs queue and claim together
// ---------------------------------------------------------------------------------------------

await run('D6: a pair that forms on a full team event waits together and claims two spots', async () => {
  const p = [];
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) p.push(await user(`d6-${i}`));
  const org = await user('d6-org');
  const ev = await privateEvent(org, p, { specification: 'team' }); // capacity 4 = two pairs
  assert((await rpc(p[0].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[1].id })) === 'confirmed', 'pair 1');
  assert((await rpc(p[2].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[3].id })) === 'confirmed', 'pair 2');

  // Full now: asking for a partner still works and leaves you interested (no JM-17 demotion).
  await rpc(p[6].jwt, 'request_partner', { p_event_id: ev, p_targets: [p[7].id] });
  assert((await part(ev, p[6])).status === 'interested', 'interested on a full event');

  // choose_partner → the pair waits together at consecutive positions, linked, no team row yet.
  assert((await rpc(p[4].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[5].id })) === 'waiting_list', 'pair 3 waits');
  const [r4, r5] = [await part(ev, p[4]), await part(ev, p[5])];
  assert(r4.status === 'waiting_list' && r5.status === 'waiting_list', 'both waiting');
  assert(r4.waiting_list_position === 1 && r5.waiting_list_position === 2, 'consecutive positions');
  assert(r4.pair_participant_id === r5.id && r5.pair_participant_id === r4.id, 'linked to each other');
  assert((await teams(ev)).length === 2, 'no team row for a waiting pair');

  // accept_partner_request on a full event → the pair waits too, behind pair 3.
  const req67 = await requestRow(ev, p[6], p[7]);
  assert((await rpc(p[7].jwt, 'accept_partner_request', { p_request_id: req67.id })) === 'waiting_list', 'pair 4 waits');
  assert((await part(ev, p[6])).waiting_list_position === 3 && (await part(ev, p[7])).waiting_list_position === 4, 'queued behind pair 3');

  // A confirmed player leaves: the partner loses the spot too (D1) → two free spots.
  await rpc(p[0].jwt, 'leave_event', { p_event_id: ev });
  assert((await part(ev, p[1])) === null, "partner's row is gone");
  assert((await notifs(p[1], 'partner_left', ev)).length === 1, 'partner told');
  for (const u of [p[4], p[5], p[6], p[7]]) assert((await notifs(u, 'waitlist_spot', ev)).length === 1, 'every waiting pair member offered');

  // B8 for pairs: two spots are free, but pairs are waiting → a new pair queues.
  assert((await rpc(p[8].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[9].id })) === 'waiting_list', 'new pair queues');

  // First come: pair 4 claims before pair 3. A lone team waiter cannot claim.
  assert((await rpc(p[7].jwt, 'claim_waitlist_spot', { p_event_id: ev })) === 'confirmed', 'pair 4 claims');
  const [r6, r7] = [await part(ev, p[6]), await part(ev, p[7])];
  assert(r6.status === 'confirmed' && r7.status === 'confirmed' && r6.pair_participant_id === null, 'both confirmed, link cleared');
  const t = (await teams(ev)).filter((x) => x.is_confirmed && [x.player_a_id, x.player_b_id].includes(r6.id));
  assert(t.length === 1 && [t[0].player_a_id, t[0].player_b_id].includes(r7.id), 'a confirmed team row for the pair');
  await expectError(() => rpc(p[4].jwt, 'claim_waitlist_spot', { p_event_id: ev }), 'spot_taken');
  const stale = await notifs(p[4], 'waitlist_spot', ev);
  assert(stale.length === 1 && stale[0].read_at && !stale[0].cta_done, "pair 3's offer is stale (read)");
  assert((await part(ev, p[4])).waiting_list_position === 1, 'queue renumbered');

  // Leaving the waiting list drops the waiting partner too, with partner_left.
  await rpc(p[8].jwt, 'leave_waiting_list', { p_event_id: ev });
  assert((await part(ev, p[9])) === null, 'waiting partner dropped');
  assert((await notifs(p[9], 'partner_left', ev)).length === 1, 'waiting partner told');
  assert((await invitation(ev, p[9])).status === 'pending', "dropped partner's invitation back to pending (private)");
  assert((await invitation(ev, p[8])).status === 'pending', "leaver's invitation back to pending (B10)");
});

// ---------------------------------------------------------------------------------------------
// D8: mixed per-gender capacity
// ---------------------------------------------------------------------------------------------

await run('D8: a mixed event splits capacity per gender and asks for a gender', async () => {
  const [m1, m2, m3, m4, f1, f2, nog] = [
    await user('d8-m1'), await user('d8-m2'), await user('d8-m3'), await user('d8-m4'),
    await user('d8-f1', { gender: 'female' }), await user('d8-f2', { gender: 'female' }),
    await user('d8-nog', { gender: null }),
  ];
  const org = await user('d8-org');
  const ev = await privateEvent(org, [m1, m2, m3, m4, f1, f2, nog], { specification: 'mixed' }); // 2 men + 2 women
  await expectError(() => rpc(nog.jwt, 'join_event', { p_event_id: ev }), 'gender_required');
  await expectError(() => rpc(nog.jwt, 'accept_event_invitation', { p_event_id: ev }), 'gender_required');
  assert((await invitation(ev, nog)).status === 'pending', 'invitation stays pending without a gender');

  assert((await rpc(m1.jwt, 'join_event', { p_event_id: ev })) === 'confirmed', 'm1');
  assert((await rpc(m2.jwt, 'join_event', { p_event_id: ev })) === 'confirmed', 'm2');
  assert((await rpc(m3.jwt, 'join_event', { p_event_id: ev })) === 'waiting_list', "men's half full → waiting list");
  assert((await rpc(m4.jwt, 'accept_event_invitation', { p_event_id: ev })) === 'waiting_list', 'accept waitlists too');
  // A man waiting does not queue ahead of a woman: her half has room.
  assert((await rpc(f1.jwt, 'join_event', { p_event_id: ev })) === 'confirmed', 'f1 confirmed past the men waiting');
  // A man cannot claim the women's free spot.
  await expectError(() => rpc(m3.jwt, 'claim_waitlist_spot', { p_event_id: ev }), 'gender_full');

  // A man leaves: only the men waiting are offered the spot.
  assert((await rpc(f2.jwt, 'join_event', { p_event_id: ev })) === 'confirmed', 'f2 fills the women');
  await rpc(m1.jwt, 'leave_event', { p_event_id: ev });
  assert((await notifs(m3, 'waitlist_spot', ev)).length === 1 && (await notifs(m4, 'waitlist_spot', ev)).length === 1, 'men waiting offered');
  assert((await rpc(m4.jwt, 'claim_waitlist_spot', { p_event_id: ev })) === 'confirmed', 'm4 claims first');

  // Guests count by guest_gender; the organizer override is unrestricted.
  const guests = await sel('event_participants', `event_id=eq.${ev}&status=eq.confirmed&select=id`);
  assert(guests.length === 4, 'balanced 2 + 2');
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Guest Woman', p_gender: 'female' });
  assert((await sel('event_participants', `event_id=eq.${ev}&status=eq.confirmed&select=id`)).length === 5, 'organizer adds past the cap');
});

// ---------------------------------------------------------------------------------------------
// D1 + B10: leaving
// ---------------------------------------------------------------------------------------------

await run('D1/B10: on a private team event both invitations return to pending and the partner is told', async () => {
  const [a, b, c] = [await user('d1-a'), await user('d1-b'), await user('d1-c')];
  const org = await user('d1-org');
  const ev = await privateEvent(org, [a, b, c], { specification: 'team' });
  await rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: b.id });
  assert((await invitation(ev, a)).status === 'accepted' && (await invitation(ev, b)).status === 'accepted', 'accepted on pairing');
  await rpc(a.jwt, 'leave_event', { p_event_id: ev });
  assert((await part(ev, a)) === null && (await part(ev, b)) === null, 'both rows gone (partner loses the spot)');
  assert((await invitation(ev, a)).status === 'pending', "leaver's own invitation pending again (B10)");
  assert((await invitation(ev, b)).status === 'pending', "partner's invitation pending again");
  const n = await notifs(b, 'partner_left', ev);
  assert(n.length === 1 && n[0].actor_id === a.id, 'partner_left from the leaver');
  const team = (await teams(ev))[0];
  assert(team && !team.is_confirmed && team.player_a_id === null && team.player_b_id === null, 'team slot emptied');
  // Blocked since: no partner_left. The partner can pair again straight away.
  await rpc(b.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: c.id });
  await block(b, c);
  await rpc(c.jwt, 'leave_event', { p_event_id: ev });
  assert((await notifs(b, 'partner_left', ev)).length === 1, 'no partner_left across a block');
});

await run('B10: on a public group event leaving leaves no invitation behind', async () => {
  const [a, b] = [await user('b10-a'), await user('b10-b')];
  const { admin, groupId } = await publicGroup('b10', [a, b]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { specification: 'team' }) });
  // A leftover invitation from before 0112.
  await insert('event_invitations', { event_id: ev, invitee_id: a.id, invited_by: admin.id, status: 'pending' });
  await rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: b.id });
  await rpc(b.jwt, 'leave_event', { p_event_id: ev });
  assert((await invitation(ev, a)) === null && (await invitation(ev, b)) === null, 'no invitations on a public event');
  assert((await notifs(a, 'partner_left', ev)).length === 1, 'partner told');
  assert((await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] })) === null, 'the partner can re-enter the team flow');
});

// ---------------------------------------------------------------------------------------------
// my_events
// ---------------------------------------------------------------------------------------------

await run('my_events: all / organizing / going / pending and the past toggle', async () => {
  const me = await user('me-me');
  const fillers = [];
  for (const i of [0, 1, 2, 3]) fillers.push(await user(`me-f${i}`));
  const org = await user('me-org');
  const organizing = await rpc(me.jwt, 'create_event', { p_payload: base(null, { is_private: true, name: 'ME organizing' }) });
  const going = await privateEvent(org, [me], { name: 'ME going' });
  await rpc(me.jwt, 'join_event', { p_event_id: going });
  const waiting = await privateEvent(org, [me, ...fillers], { name: 'ME waiting' });
  for (const f of fillers) await rpc(f.jwt, 'join_event', { p_event_id: waiting });
  assert((await rpc(me.jwt, 'join_event', { p_event_id: waiting })) === 'waiting_list', 'waiting');
  const interested = await privateEvent(org, [me], { name: 'ME interested', specification: 'team' });
  assert((await rpc(me.jwt, 'accept_event_invitation', { p_event_id: interested })) === 'interested', 'interested');
  const pending = await privateEvent(org, [me], { name: 'ME pending' });
  const closedInvite = await privateEvent(org, [me], { name: 'ME closed invite' });
  await patch('events', `id=eq.${closedInvite}`, { starts_at: hoursFromNow(3) });
  const past = await privateEvent(org, [me], { name: 'ME past' });
  await rpc(me.jwt, 'join_event', { p_event_id: past });
  await patch('events', `id=eq.${past}`, { starts_at: hoursFromNow(-72), status: 'completed' });
  const cancelled = await privateEvent(org, [me], { name: 'ME cancelled' });
  await rpc(me.jwt, 'join_event', { p_event_id: cancelled });
  await patch('events', `id=eq.${cancelled}`, { status: 'cancelled' });

  const ids = async (filter, includePast = false) =>
    (await rpc(me.jwt, 'my_events', { p_filter: filter, p_limit: 50, p_offset: 0, p_include_past: includePast })).map((e) => e.id);
  const same = (got, want, label) =>
    assert([...got].sort().join() === [...want].sort().join(), `${label}: got ${got.length}, want ${want.length}`);

  same(await ids('organizing'), [organizing], 'organizing');
  same(await ids('going'), [going, waiting, interested], 'going = confirmed + waiting + interested');
  same(await ids('pending'), [pending], 'pending = answerable invitations only');
  same(await ids('all'), [organizing, going, waiting, interested, pending], 'all = union');
  const withPast = await ids('all', true);
  same(withPast, [organizing, going, waiting, interested, pending, past], 'past adds completed, never cancelled');
  assert(withPast[withPast.length - 1] === past, 'past events listed after current ones');
  same(await ids('pending', true), [pending], 'the toggle never adds unanswerable invitations');
  // Backward compatible: the three-argument call still works (p_include_past defaults to false).
  same((await rpc(me.jwt, 'my_events', { p_filter: 'going', p_limit: 50, p_offset: 0 })).map((e) => e.id),
    [going, waiting, interested], 'default call');
  await expectError(() => anonRpc('my_events', {}), '42501');
});

// ---------------------------------------------------------------------------------------------
// event_invited_players
// ---------------------------------------------------------------------------------------------

await run('event_invited_players: pending invitees for anyone who can see the event', async () => {
  const [viewer, a, accepted, blocked, outsider] = [
    await user('eip-viewer'), await user('eip-a', { name: 'Alice Invited' }), await user('eip-acc'),
    await user('eip-blk'), await user('eip-out'),
  ];
  const org = await user('eip-org');
  const ev = await rpc(org.jwt, 'create_event', {
    p_payload: base(null, {
      is_private: true,
      invitees: [...invitees(viewer, a, accepted, blocked), { invitee_id: null, name: 'Manual Guest', email: 'guest@example.test', phone: null }],
    }),
  });
  await rpc(accepted.jwt, 'accept_event_invitation', { p_event_id: ev });
  await block(viewer, blocked);
  const rows = await rpc(viewer.jwt, 'event_invited_players', { p_event_id: ev });
  const names = rows.map((r) => r.full_name ?? r.invitee_name);
  assert(names.includes('Alice Invited') && names.includes('Manual Guest'), 'invitee and manual invitee listed');
  assert(!rows.some((r) => r.user_id === accepted.id), 'an accepted invitee is not "invited"');
  assert(!rows.some((r) => r.user_id === blocked.id), 'blocked either way is left out');
  assert(rows.every((r) => !('phone' in r) && !('email' in r) && !('invitee_email' in r)), 'no contact columns');
  const manual = rows.find((r) => r.invitee_name === 'Manual Guest');
  assert(manual.user_id === null, 'manual invitee has no user');
  await expectError(() => rpc(outsider.jwt, 'event_invited_players', { p_event_id: ev }), 'event_not_found');
  await expectError(() => anonRpc('event_invited_players', { p_event_id: ev }), '42501');
});

// ---------------------------------------------------------------------------------------------
// 0111 review follow-ups
// ---------------------------------------------------------------------------------------------

await run('R1: a withdrawn request can no longer be accepted', async () => {
  const [org, r, t] = [await user('r1-org'), await user('r1-r'), await user('r1-t')];
  const ev = await privateEvent(org, [r, t], { specification: 'team' });
  await rpc(r.jwt, 'request_partner', { p_event_id: ev, p_targets: [t.id] });
  const q = await requestRow(ev, r, t);
  await rpc(r.jwt, 'withdraw_partner_request', { p_request_id: q.id });
  await expectError(() => rpc(t.jwt, 'accept_partner_request', { p_request_id: q.id }), 'request_not_found');
  assert((await teams(ev)).length === 0, 'no team');
});

await run('R2: a system-closed or accepted request re-opens on a new ask; a target decline stays', async () => {
  const [org, r, t1, t2, x] = [await user('r2-org'), await user('r2-r'), await user('r2-t1'), await user('r2-t2'), await user('r2-x')];
  const ev = await privateEvent(org, [r, t1, t2, x], { specification: 'team', num_courts: 2 });
  await rpc(r.jwt, 'request_partner', { p_event_id: ev, p_targets: [t1.id, t2.id, x.id] });
  await rpc(x.jwt, 'decline_partner_request', { p_request_id: (await requestRow(ev, r, x)).id });
  assert((await requestRow(ev, r, x)).closed_by_system === false, 'target decline is not a system close');
  // t1 accepts: both invitations are answered, r's other asks are closed by the system.
  await rpc(t1.jwt, 'accept_partner_request', { p_request_id: (await requestRow(ev, r, t1)).id });
  assert((await invitation(ev, r)).status === 'accepted' && (await invitation(ev, t1)).status === 'accepted', 'both invitations accepted');
  const closed = await requestRow(ev, r, t2);
  assert(closed.status === 'declined' && closed.closed_by_system, 'closed by the system');
  // The team breaks up; r asks again.
  await rpc(t1.jwt, 'leave_event', { p_event_id: ev });
  assert((await part(ev, r)) === null, 'r lost the spot with the team');
  await rpc(r.jwt, 'request_partner', { p_event_id: ev, p_targets: [t2.id, t1.id, x.id] });
  const again = await requestRow(ev, r, t2);
  assert(again.status === 'pending' && !again.closed_by_system, 'system-closed ask re-opened');
  assert((await requestRow(ev, r, t1)).status === 'pending', 'accepted ask of a broken team re-opened');
  assert((await requestRow(ev, r, x)).status === 'declined', "the target's own decline stays sticky");
});

await run('R6: an organizer removal withdraws the removed player\'s pending asks', async () => {
  const [org, r, t] = [await user('r6-org'), await user('r6-r'), await user('r6-t')];
  const ev = await privateEvent(org, [r, t], { specification: 'team' });
  await rpc(r.jwt, 'request_partner', { p_event_id: ev, p_targets: [t.id] });
  const row = await part(ev, r);
  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: row.id, p_mode: 'from_event' });
  assert((await requestRow(ev, r, t)) === null, 'request withdrawn');
});

// ---------------------------------------------------------------------------------------------
// Review of #213
// ---------------------------------------------------------------------------------------------

await run('orphans: when one half of a waiting pair goes, the other is released, not stranded', async () => {
  const p = [];
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) p.push(await user(`orph-${i}`));
  const org = await user('orph-org');
  const ev = await privateEvent(org, p, { specification: 'team' });
  await rpc(p[0].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[1].id });
  await rpc(p[2].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[3].id });
  assert((await rpc(p[4].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[5].id })) === 'waiting_list', 'pair A waits');
  assert((await rpc(p[6].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[7].id })) === 'waiting_list', 'pair B waits');

  // Organizer removes one half of pair A.
  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: (await part(ev, p[4])).id, p_mode: 'from_event' });
  const r5 = await part(ev, p[5]);
  assert(r5.status === 'interested' && r5.pair_participant_id === null && r5.waiting_list_position === null, 'other half back to interested');
  assert((await part(ev, p[6])).waiting_list_position === 1 && (await part(ev, p[7])).waiting_list_position === 2, 'queue renumbered');

  // Organizer confirms one half of pair B.
  await rpc(org.jwt, 'organizer_mark_confirmed', { p_participant_id: (await part(ev, p[6])).id });
  const [r6, r7] = [await part(ev, p[6]), await part(ev, p[7])];
  assert(r6.status === 'confirmed' && r6.pair_participant_id === null, 'confirmed half unlinked');
  assert(r7.status === 'interested' && r7.pair_participant_id === null, 'other half back to interested');

  // Nobody is left half-queued, so the event is not frozen: free spots go to the next pair.
  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: r6.id, p_mode: 'from_event' });
  await rpc(p[0].jwt, 'leave_event', { p_event_id: ev }); // p0 + p1 leave: two spots free
  assert((await rpc(p[8].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[9].id })) === 'confirmed', 'next pair confirms');
  assert((await rpc(p[5].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[7].id })) === 'waiting_list', 'released halves can pair again');
});

await run('a pair never demotes a confirmed player into the queue', async () => {
  const p = [];
  for (const i of [0, 1, 2, 3, 4]) p.push(await user(`nodem-${i}`));
  const org = await user('nodem-org');
  const ev = await privateEvent(org, p, { specification: 'team', organizer_role: 'organizing_and_playing' });
  await rpc(p[0].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[1].id }); // 3 confirmed
  assert((await rpc(p[2].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[3].id })) === 'waiting_list', 'no room for two');
  await expectError(() => rpc(org.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[4].id }), 'event_full');
  assert((await part(ev, org)).status === 'confirmed', 'organizer keeps the spot');
});

await run('a removed player cannot re-enter by accepting an incoming request', async () => {
  const [org, a, x, y] = [await user('rm-org'), await user('rm-a'), await user('rm-x'), await user('rm-y')];
  const ev = await privateEvent(org, [a, x, y], { specification: 'team' });
  await rpc(x.jwt, 'request_partner', { p_event_id: ev, p_targets: [y.id] });   // x is interested
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [x.id] });   // a asks x
  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: (await part(ev, x)).id, p_mode: 'from_event' });
  const q = await requestRow(ev, a, x);
  assert(q.status === 'declined' && q.closed_by_system, 'the incoming request is closed by the system');
  await expectError(() => rpc(x.jwt, 'accept_partner_request', { p_request_id: q.id }), 'request_not_found');
  // Even a request that slipped through stays shut: x is neither invited nor a participant any more.
  const [late] = await insert('partner_requests', { event_id: ev, requester_id: y.id, target_id: x.id, status: 'pending' });
  await expectError(() => rpc(x.jwt, 'accept_partner_request', { p_request_id: late.id }), 'forbidden');
  assert((await part(ev, x)) === null, 'x stays out');
});

await run("'to_invited' on a public group event leaves a group member with no invitation", async () => {
  const [a] = [await user('ti-a')];
  const { admin, groupId } = await publicGroup('ti', [a]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId) });
  await rpc(a.jwt, 'join_event', { p_event_id: ev });
  await rpc(admin.jwt, 'organizer_remove_participant', { p_participant_id: (await part(ev, a)).id, p_mode: 'to_invited' });
  assert((await invitation(ev, a)) === null, 'no invitation recreated');
});

await run('the public-event clean-up spares explicit invitations to non-members', async () => {
  const [member, outsider] = [await user('cl-m'), await user('cl-out')];
  const { admin, groupId } = await publicGroup('cl', [member]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId) });
  // What a pre-0112 auto-invite left behind for a member, plus explicit invitations to an outsider
  // and to a manual contact.
  const [inv] = await insert('event_invitations', { event_id: ev, invitee_id: member.id, invited_by: admin.id, status: 'pending' });
  await insert('notifications', { user_id: member.id, type: 'event_invite', actor_id: admin.id, event_id: ev, ref_id: inv.id });
  await rpc(admin.jwt, 'invite_to_event', {
    p_event_id: ev,
    p_invitees: [{ invitee_id: outsider.id, name: null, email: null, phone: null }, { name: 'Manual', email: 'm@example.test', phone: null }],
  });
  await rpc(null, '_cleanup_public_event_invitations', {});
  assert((await invitation(ev, member)) === null, "the member's leftover invitation is gone");
  assert((await invitation(ev, outsider))?.status === 'pending', "the outsider's explicit invitation stays");
  assert((await sel('event_invitations', `event_id=eq.${ev}&invitee_name=eq.Manual&select=id`)).length === 1, 'manual invitee stays');
  assert((await notifs(member, 'event_invite', ev)).length === 0 && (await notifs(member, 'event_created', ev)).length === 1,
    'the dead invite notification became event_created');
});

// ---------------------------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------------------------

await run('internal helpers are closed to the API; the new RPCs are open to signed-in users only', async () => {
  const someone = await user('grants');
  const Z = '00000000-0000-0000-0000-000000000000';
  const internal = [
    ['_mixed_gender_full', { p_event_id: Z, p_gender: 'male' }],
    ['_has_waiters', { p_event_id: Z, p_gender: null }],
    ['_waiter_can_claim', { p_event_id: Z, p_pid: Z }],
    ['_may_enter_team_flow', { p_event_id: Z, p_user: Z }],
    ['_notify_event_created', { p_event_id: Z }],
    ['_reset_invitation_after_leave', { p_event_id: Z, p_user: Z, p_create: false }],
    ['_drop_partner', { p_event_id: Z, p_partner_pid: Z, p_leaver: Z }],
    ['_renumber_waiting_list', { p_event_id: Z }],
    ['notify_waitlist_spot', { p_event_id: Z, p_actor: null }],
    ['_cleanup_public_event_invitations', {}],
  ];
  for (const [fn, args] of internal) await expectError(() => rpc(someone.jwt, fn, args), '42501');
  await expectError(() => rpc(someone.jwt, 'event_invited_players', { p_event_id: Z }), 'event_not_found');
  const mine = await rpc(someone.jwt, 'my_events', { p_filter: 'pending' });
  assert(Array.isArray(mine) && mine.length === 0, 'my_events callable');
});
