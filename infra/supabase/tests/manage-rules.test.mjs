// infra/supabase/tests/manage-rules.test.mjs
//
// Migration 0122 (UX Audit — Manage Event, plan PR "0122 — manage rules": D1–D4, D7, D9, D12–D15,
// B8, B11–B13), through PostgREST as the signed-in organizer or player. Fixtures (invitations,
// follows, statuses no RPC sets) are written with the service role.
import { user, rpc, req, sel, insert, patch, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);

const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Rules ${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: true, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const invitees = (...us) => us.map((u) => ({ invitee_id: u.id }));

/** A private group-less event (always private) with the given invitees. */
const privateEvent = (org, list = [], over = {}) =>
  rpc(org.jwt, 'create_event', { p_payload: payload(null, { invitees: invitees(...list), ...over }) });

/** Organizer + community on Pro + a group (public unless said) with `members`. */
async function group(t, members = [], { isPrivate = false } = {}) {
  const admin = await user(`${t}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Rules ${t} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const groupId = await rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Rules', p_description: null, p_is_private: isPrivate, p_thumbnail_path: null,
  });
  for (const u of members) {
    await insert('community_members', { community_id: communityId, user_id: u.id, role: 'member' });
    await insert('group_members', { group_id: groupId, user_id: u.id });
  }
  return { admin, groupId, communityId };
}

const eventRow = (ev) => sel('events', `id=eq.${ev}&select=*`).then((r) => r[0]);
const rows = (ev) => sel('event_participants', `event_id=eq.${ev}&select=id,user_id,guest_name,status,is_standby,has_paid,paid_amount,waiting_list_position&order=joined_at`);
const part = (ev, u) => sel('event_participants', `event_id=eq.${ev}&user_id=eq.${u.id}&select=id,status,is_standby,has_paid,paid_amount`).then((r) => r[0]);
const invs = (ev) => sel('event_invitations', `event_id=eq.${ev}&select=id,invitee_id,status`);
const notifs = (u, type, ev) => sel('notifications', `user_id=eq.${u.id}&type=eq.${type}&event_id=eq.${ev}&select=id,cta_done`);
const activity = (ev, action) => sel('event_activity', `event_id=eq.${ev}${action ? `&action=eq.${action}` : ''}&select=action,actor_id,detail&order=created_at`);
const invite = (ev, org, u) => insert('event_invitations', { event_id: ev, invitee_id: u.id, invited_by: org.id });

/** A private classic event with `n` confirmed players (the organizer does not play). */
async function withPlayers(t, n, over = {}) {
  const org = await user(`${t}-org`);
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(await user(`${t}-p${i}`));
  const ev = await privateEvent(org, ps, over);
  for (const p of ps) await rpc(p.jwt, 'accept_event_invitation', { p_event_id: ev });
  return { org, ps, ev };
}
const check = (org, ev) => rpc(org.jwt, 'start_event_check', { p_event_id: ev });
const matches = (ev) => sel('event_matches', `event_id=eq.${ev}&select=id,round_id,court_number,status&order=court_number`);
const rests = (roundId) => sel('round_rest', `round_id=eq.${roundId}&select=participant_id`);
const round = (ev, n) => sel('event_rounds', `event_id=eq.${ev}&round_number=eq.${n}&select=id`).then((r) => r[0]);

// ---------------------------------------------------------------------------------------------
// D1: start rules
// ---------------------------------------------------------------------------------------------
await run('D1: below capacity starts; start_event_check warns about open spots and idle courts', async () => {
  const { org, ev } = await withPlayers('d1a', 4, { num_courts: 2 });
  const c = await check(org, ev);
  assert(c.blockers.length === 0, `no blockers, got ${JSON.stringify(c.blockers)}`);
  const below = c.warnings.find((w) => w.code === 'below_capacity');
  const idle = c.warnings.find((w) => w.code === 'idle_courts');
  assert(below && below.open_spots === 4, `4 open spots, got ${JSON.stringify(c.warnings)}`);
  assert(idle && idle.idle === 1, 'one idle court');
  await rpc(org.jwt, 'start_event', { p_event_id: ev });
  assert((await eventRow(ev)).status === 'in_progress', 'started');
  const m = await matches(ev);
  assert(m.length === 1 && m[0].court_number === 1, 'one court in use');
});

await run('D1: fewer than 4, an odd count without stand-by, and the start before starts_at', async () => {
  const three = await withPlayers('d1b', 3);
  assert(JSON.stringify((await check(three.org, three.ev)).blockers) === JSON.stringify(['not_enough_players', 'odd_players']), 'three: two blockers');
  await expectError(() => rpc(three.org.jwt, 'start_event', { p_event_id: three.ev }), 'not_enough_players');

  const five = await withPlayers('d1c', 5, { num_courts: 2 });
  assert(JSON.stringify((await check(five.org, five.ev)).blockers) === JSON.stringify(['odd_players']), 'five: odd');
  await expectError(() => rpc(five.org.jwt, 'start_event', { p_event_id: five.ev }), 'odd_players');

  // With stand-by on, an odd count plays: 4 seated, 1 rests, a court idle.
  const sb = await withPlayers('d1d', 5, { num_courts: 2, allow_standby: true, standby_spots: 2 });
  const c = await check(sb.org, sb.ev);
  assert(c.blockers.length === 0 && c.warnings.some((w) => w.code === 'idle_courts' && w.idle === 1), 'stand-by: warnings only');
  await rpc(sb.org.jwt, 'start_event', { p_event_id: sb.ev });   // 72 h before starts_at
  const r1 = await round(sb.ev, 1);
  assert((await matches(sb.ev)).length === 1 && (await rests(r1.id)).length === 1, 'one match, one rest');
});

await run('D1: a team event with a player outside a complete team is blocked', async () => {
  const org = await user('d1t-org');
  const [a, b, c, d] = [await user('d1t-a'), await user('d1t-b'), await user('d1t-c'), await user('d1t-d')];
  const ev = await privateEvent(org, [a, b, c, d], { specification: 'team', num_courts: 2 });
  await rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: b.id });
  await rpc(c.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: d.id });
  assert((await check(org, ev)).blockers.length === 0, 'two complete teams start');
  await rpc(org.jwt, 'organizer_add_guest_to_team', { p_event_id: ev, p_team_number: 3, p_slot: 'a', p_name: 'Lone guest' });
  assert((await check(org, ev)).blockers.includes('teams_incomplete'), 'a lone guest blocks');
  await expectError(() => rpc(org.jwt, 'start_event', { p_event_id: ev }), 'teams_incomplete');
});

await run('D1: a client schedule is validated — own confirmed participants, courts within the event', async () => {
  const { org, ev } = await withPlayers('d1r', 6, { num_courts: 2 });
  const other = await withPlayers('d1r2', 1);
  const ids = (await rows(ev)).map((r) => r.id);
  const foreign = (await rows(other.ev))[0].id;
  const plan = (m, rest) => [{ round_number: 1, rests: rest, matches: m }];
  const good = { court_number: 1, match_number: 1, side_a: [ids[0], ids[1]], side_b: [ids[2], ids[3]] };
  await expectError(() => rpc(org.jwt, 'start_event', { p_event_id: ev, p_rounds: plan([{ ...good, side_b: [ids[2], foreign] }], [ids[4], ids[5]]) }), 'invalid_participant');
  await expectError(() => rpc(org.jwt, 'start_event', { p_event_id: ev, p_rounds: plan([{ ...good, court_number: 3 }], [ids[4], ids[5]]) }), 'invalid_rounds');
  await expectError(() => rpc(org.jwt, 'start_event', { p_event_id: ev, p_rounds: plan([good], [ids[3], ids[5]]) }), 'invalid_rounds');
  assert((await eventRow(ev)).status === 'scheduled', 'nothing started');
  await rpc(org.jwt, 'start_event', { p_event_id: ev, p_rounds: plan([good], [ids[4], ids[5]]) });
  assert((await matches(ev)).length === 1, 'six players below capacity: one court');
});

await run('D1: Mexicano below capacity rests the remainder every round', async () => {
  const { org, ev } = await withPlayers('d1m', 6, { num_courts: 2, event_type: 'mexicano', allow_standby: true, standby_spots: 2 });
  await rpc(org.jwt, 'start_event', { p_event_id: ev });
  const [m1] = await matches(ev);
  await rpc(org.jwt, 'submit_score', { p_match_id: m1.id, p_side_a: 20, p_side_b: 4 });
  await rpc(org.jwt, 'generate_next_round', { p_event_id: ev });
  const r2 = await round(ev, 2);
  const m2 = (await matches(ev)).filter((m) => m.round_id === r2.id);
  assert(m2.length === 1, `round 2 seats 4 on one court, got ${m2.length} matches`);
  assert((await rests(r2.id)).length === 2, 'the other two rest (was: dropped without a rest row)');
});

// ---------------------------------------------------------------------------------------------
// D2 + B12: organizer confirmations
// ---------------------------------------------------------------------------------------------
await run('D2/B12: confirm an invitee — row, invitation, stand-by, notification, activity', async () => {
  const { org, ps, ev } = await withPlayers('d2', 4, { allow_standby: true, standby_spots: 1 });
  const [late, later] = [await user('d2-late'), await user('d2-later')];
  await invite(ev, org, late); await invite(ev, org, later);
  await expectError(() => rpc(ps[0].jwt, 'organizer_confirm_invitee', { p_event_id: ev, p_user_id: late.id }), 'forbidden');
  const pid = await rpc(org.jwt, 'organizer_confirm_invitee', { p_event_id: ev, p_user_id: late.id });
  const row = await part(ev, late);
  assert(row.id === pid && row.status === 'confirmed' && row.is_standby, 'confirmed as stand-by past the regular spots');
  assert((await invs(ev)).find((i) => i.invitee_id === late.id).status === 'accepted', 'invitation accepted');
  assert((await notifs(late, 'organizer_confirmed', ev)).length === 1, 'organizer_confirmed sent');
  const conf = await activity(ev, 'confirmed');
  assert(conf.length === 1 && conf[0].actor_id === org.id, 'one confirmed row, by the organizer');
  // Full now: the next one is refused, not waitlisted.
  await expectError(() => rpc(org.jwt, 'organizer_confirm_invitee', { p_event_id: ev, p_user_id: later.id }), 'event_full');
  // Somebody without an invitation cannot be confirmed this way.
  const stranger = await user('d2-str');
  await expectError(() => rpc(org.jwt, 'organizer_confirm_invitee', { p_event_id: ev, p_user_id: stranger.id }), 'invitation_not_found');
});

await run('D2: the waiting list is not confirmable; the mixed half and team events are respected', async () => {
  const { org, ev } = await withPlayers('d2w', 4);
  const w = await user('d2w-w');
  await invite(ev, org, w);
  assert((await rpc(w.jwt, 'accept_event_invitation', { p_event_id: ev })) === 'waiting_list', 'waits');
  await expectError(async () => rpc(org.jwt, 'organizer_mark_confirmed', { p_participant_id: (await part(ev, w)).id }), 'waitlist_not_confirmable');
  await expectError(() => rpc(org.jwt, 'organizer_confirm_invitee', { p_event_id: ev, p_user_id: w.id }), 'waitlist_not_confirmable');

  const morg = await user('d2m-org');
  const [m1, m2, m3, nog] = [await user('d2m-1'), await user('d2m-2'), await user('d2m-3'), await user('d2m-n', { gender: null })];
  const mev = await privateEvent(morg, [m1, m2, m3, nog], { specification: 'mixed' });
  await rpc(m1.jwt, 'accept_event_invitation', { p_event_id: mev });
  await rpc(m2.jwt, 'accept_event_invitation', { p_event_id: mev });
  await expectError(() => rpc(morg.jwt, 'organizer_confirm_invitee', { p_event_id: mev, p_user_id: m3.id }), 'gender_full');
  await expectError(() => rpc(morg.jwt, 'organizer_confirm_invitee', { p_event_id: mev, p_user_id: nog.id }), 'player_gender_required');

  const torg = await user('d2t-org');
  const [ta, tb] = [await user('d2t-a'), await user('d2t-b')];
  const tev = await privateEvent(torg, [ta, tb], { specification: 'team' });
  await rpc(ta.jwt, 'request_partner', { p_event_id: tev, p_targets: [] });
  await expectError(async () => rpc(torg.jwt, 'organizer_mark_confirmed', { p_participant_id: (await part(tev, ta)).id }), 'team_required');
  await expectError(() => rpc(torg.jwt, 'organizer_confirm_invitee', { p_event_id: tev, p_user_id: tb.id }), 'team_required');
  // With a team and slot next to the interested player: the pair is complete, both confirmed.
  await rpc(torg.jwt, 'organizer_assign_to_team', { p_event_id: tev, p_participant_id: (await part(tev, ta)).id, p_team_number: 1, p_slot: 'a' });
  await rpc(torg.jwt, 'organizer_confirm_invitee', { p_event_id: tev, p_user_id: tb.id, p_team_number: 1, p_slot: 'b' });
  assert((await part(tev, ta)).status === 'confirmed' && (await part(tev, tb)).status === 'confirmed', 'pair confirmed');
  assert((await notifs(tb, 'organizer_confirmed', tev)).length === 1, 'the invitee is told');
});

// ---------------------------------------------------------------------------------------------
// D3 + B12: removal
// ---------------------------------------------------------------------------------------------
await run('D3/B12: public group events remove from the event only; the removed player is told', async () => {
  const [a, b] = [await user('d3-a'), await user('d3-b')];
  const { admin, groupId } = await group('d3', [a, b]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId, { is_private: false }) });
  await rpc(a.jwt, 'join_event', { p_event_id: ev });
  await rpc(b.jwt, 'join_event', { p_event_id: ev });
  await expectError(async () => rpc(admin.jwt, 'organizer_remove_participant', { p_participant_id: (await part(ev, a)).id, p_mode: 'to_invited' }), 'invalid_mode');
  await rpc(admin.jwt, 'organizer_remove_participant', { p_participant_id: (await part(ev, a)).id, p_mode: 'from_event' });
  assert(!(await part(ev, a)), 'removed');
  assert((await notifs(a, 'removed_from_event', ev)).length === 1, 'removed_from_event sent');

  const { org, ps, ev: pev } = await withPlayers('d3p', 2);
  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: (await part(pev, ps[0])).id, p_mode: 'to_invited' });
  assert((await invs(pev)).find((i) => i.invitee_id === ps[0].id).status === 'pending', 'private: back to invited');
  assert((await notifs(ps[0], 'removed_from_event', pev)).length === 1, 'told as well');
});

// ---------------------------------------------------------------------------------------------
// D9: payments
// ---------------------------------------------------------------------------------------------
await run('D9: paid_amount credit — top-up, fee changes, unpaid, mark all', async () => {
  const fee = { entrance_fee_enabled: true, entrance_fee_amount: 10, entrance_fee_method: 'cash' };
  const { org, ps, ev } = await withPlayers('d9', 3, fee);
  const p0 = await part(ev, ps[0]);
  await rpc(org.jwt, 'mark_paid', { p_participant_id: p0.id, p_paid: true });
  let r = await part(ev, ps[0]);
  assert(r.has_paid && Number(r.paid_amount) === 10, 'paid 10');

  const edit = (over) => rpc(org.jwt, 'update_event', { p_event_id: ev, p_payload: { ...payload(null, fee), ...over, name: 'D9', starts_at: hoursFromNow(72) } });
  await edit({ entrance_fee_amount: 15 });
  r = await part(ev, ps[0]);
  assert(!r.has_paid && Number(r.paid_amount) === 10, 'a raise: pending for the difference, credit kept');
  const fc = await activity(ev, 'fee_changed');
  assert(fc.length === 1 && Number(fc[0].detail.from) === 10 && Number(fc[0].detail.to) === 15, 'fee_changed logged');
  await rpc(org.jwt, 'mark_paid', { p_participant_id: p0.id, p_paid: true });
  r = await part(ev, ps[0]);
  assert(r.has_paid && Number(r.paid_amount) === 15, 'topped up to 15');
  await edit({ entrance_fee_amount: 12 });
  assert((await part(ev, ps[0])).has_paid, 'a cut keeps them paid');
  await rpc(org.jwt, 'mark_paid', { p_participant_id: p0.id, p_paid: false });
  r = await part(ev, ps[0]);
  assert(!r.has_paid && Number(r.paid_amount) === 0, 'unpaid clears the credit');
  await rpc(org.jwt, 'mark_all_paid', { p_event_id: ev });
  assert((await rows(ev)).every((x) => x.has_paid && Number(x.paid_amount) === 12), 'everyone at the current fee');
});

// ---------------------------------------------------------------------------------------------
// D4 + B8: duplicate
// ---------------------------------------------------------------------------------------------
await run('D4/B8: duplicate — a future date is required, nothing carries over, location can change', async () => {
  const { org, ev } = await withPlayers('d4', 2, { organizer_role: 'organizing_and_playing', num_courts: 2 });
  const declined = await user('d4-dec');
  await insert('event_invitations', { event_id: ev, invitee_id: declined.id, invited_by: org.id, status: 'declined' });
  await expectError(() => rpc(org.jwt, 'duplicate_event', { p_event_id: ev, p_overrides: {} }), 'starts_at_required');
  await expectError(() => rpc(org.jwt, 'duplicate_event', { p_event_id: ev, p_overrides: { starts_at: hoursFromNow(-1) } }), 'starts_at_in_past');
  await expectError(() => rpc(org.jwt, 'duplicate_event', { p_event_id: ev, p_overrides: { starts_at: hoursFromNow(96), venue_id: crypto.randomUUID() } }), 'venue_not_found');
  await expectError(() => rpc(org.jwt, 'duplicate_event', { p_event_id: ev, p_overrides: { starts_at: hoursFromNow(96), num_courts: 3, manual_court_names: ['A'] } }), 'invalid_court_names');

  const copy = await rpc(org.jwt, 'duplicate_event', { p_event_id: ev, p_overrides: {
    starts_at: hoursFromNow(96), name: 'Copy', thumbnail_path: 'presets/2.jpg',
    manual_location_name: 'Other club', manual_location_address: 'Elsewhere', has_location: true,
    num_courts: 3, manual_court_names: ['A', 'B', 'C'],
  } });
  const row = await eventRow(copy);
  assert(row.name === 'Copy' && row.thumbnail_path === 'presets/2.jpg' && row.series_id === null, 'name, thumbnail, one-off');
  assert(row.manual_location_name === 'Other club' && row.num_courts === 3 && JSON.stringify(row.manual_court_names) === '["A","B","C"]', 'new location and courts');
  assert((await invs(copy)).length === 0, 'no invitations (declined or not)');
  const r = await rows(copy);
  assert(r.length === 1 && r[0].user_id === org.id && r[0].status === 'confirmed', 'only the playing organizer is seated');

  const same = await rpc(org.jwt, 'duplicate_event', { p_event_id: ev, p_overrides: { starts_at: hoursFromNow(120) } });
  const srow = await eventRow(same);
  assert(srow.manual_location_name === 'Court' && srow.num_courts === 2 && srow.name !== 'Copy', 'no location override: the original location');
});

// ---------------------------------------------------------------------------------------------
// D12: invitations
// ---------------------------------------------------------------------------------------------
await run('D12: invite_to_event scope — public group refused, members only, blocked, skip existing', async () => {
  const [m1, m2, m3] = [await user('d12-m1'), await user('d12-m2'), await user('d12-m3')];
  const outsider = await user('d12-out');
  const { admin, groupId } = await group('d12', [m1, m2, m3]);
  const pub = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId, { is_private: false }) });
  await expectError(() => rpc(admin.jwt, 'invite_to_event', { p_event_id: pub, p_invitees: invitees(m1) }), 'invites_not_allowed');

  const priv = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId, { is_private: true, invitees: invitees(m1) }) });
  await expectError(() => rpc(admin.jwt, 'invite_to_event', { p_event_id: priv, p_invitees: invitees(outsider) }), 'not_group_member');
  await rpc(m3.jwt, 'block_user', { p_target: admin.id });
  await expectError(() => rpc(admin.jwt, 'invite_to_event', { p_event_id: priv, p_invitees: invitees(m3) }), 'blocked');
  await rpc(admin.jwt, 'invite_to_event', { p_event_id: priv, p_invitees: invitees(m1, m2, admin) });
  const list = await invs(priv);
  assert(list.length === 2 && list.filter((i) => i.invitee_id === m1.id).length === 1, 'm1 not duplicated, m2 added, the organizer skipped');

  // A direct insert (the old organizer policy) is closed.
  await expectError(() => req('/rest/v1/event_invitations', { method: 'POST', jwt: admin.jwt, body: { event_id: priv, invitee_id: outsider.id, invited_by: admin.id } }), 'permission denied');

  // Group-less: any platform user.
  const org = await user('d12-org');
  const ev = await privateEvent(org);
  await rpc(org.jwt, 'invite_to_event', { p_event_id: ev, p_invitees: invitees(outsider) });
  assert((await invs(ev)).length === 1, 'platform user invited');
  await expectError(() => rpc(org.jwt, 'invite_to_event', { p_event_id: ev, p_invitees: [{ invitee_id: crypto.randomUUID() }] }), 'user_not_found');
});

await run('D12: event_invite_candidates — sections, exclusions', async () => {
  const org = await user('d12c-org', { name: `Cand Org ${tag()}` });
  const t = tag();
  const [conn, fol, other, blocked, invited] = await Promise.all(['conn', 'fol', 'other', 'blk', 'inv'].map((k) => user(`d12c-${k}`, { name: `Zed${t} ${k}` })));
  await insert('follows', [
    { follower_id: org.id, followee_id: conn.id }, { follower_id: conn.id, followee_id: org.id },
    { follower_id: org.id, followee_id: fol.id }, { follower_id: org.id, followee_id: invited.id },
    { follower_id: org.id, followee_id: blocked.id },
  ]);
  await rpc(blocked.jwt, 'block_user', { p_target: org.id });
  const ev = await privateEvent(org, [invited]);
  await expectError(() => rpc(conn.jwt, 'event_invite_candidates', { p_event_id: ev }), 'forbidden');

  const empty = await rpc(org.jwt, 'event_invite_candidates', { p_event_id: ev, p_query: '' });
  const sec = (list, u) => list.find((r) => r.id === u.id)?.section;
  assert(sec(empty, conn) === 'connections' && sec(empty, fol) === 'following', 'connections, then following');
  assert(!sec(empty, other) && !sec(empty, invited) && !sec(empty, blocked), 'no query: nobody else; invitees and blocked excluded');
  assert(empty.findIndex((r) => r.id === conn.id) < empty.findIndex((r) => r.id === fol.id), 'connections first');

  const q = await rpc(org.jwt, 'event_invite_candidates', { p_event_id: ev, p_query: `Zed${t}` });
  assert(sec(q, other) === 'others' && sec(q, conn) === 'connections', 'a query adds everyone else');
  assert(!sec(q, blocked) && !sec(q, invited), 'still excluded');

  const [m1, m2] = [await user('d12g-m1'), await user('d12g-m2')];
  const { admin, groupId } = await group('d12g', [m1, m2]);
  const gev = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId, { is_private: true, invitees: invitees(m1) }) });
  const g = await rpc(admin.jwt, 'event_invite_candidates', { p_event_id: gev });
  assert(g.length === 1 && g[0].id === m2.id && g[0].section === 'members', 'group event: members not yet invited');
  const pub = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId, { is_private: false }) });
  assert((await rpc(admin.jwt, 'event_invite_candidates', { p_event_id: pub })).length === 0, 'public group event: nobody');
});

// ---------------------------------------------------------------------------------------------
// D7: guests in team slots
// ---------------------------------------------------------------------------------------------
await run('D7: organizer_add_guest_to_team — confirmed guest in the slot, pair reconciled, capacity', async () => {
  const org = await user('d7-org');
  const a = await user('d7-a');
  const ev = await privateEvent(org, [a], { specification: 'team' });   // 1 court: 4 spots, 2 teams
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [] });
  await rpc(org.jwt, 'organizer_assign_to_team', { p_event_id: ev, p_participant_id: (await part(ev, a)).id, p_team_number: 1, p_slot: 'a' });
  await expectError(() => rpc(org.jwt, 'organizer_add_guest_to_team', { p_event_id: ev, p_team_number: 1, p_slot: 'a', p_name: 'G' }), 'slot_taken');
  await expectError(() => rpc(org.jwt, 'organizer_add_guest_to_team', { p_event_id: ev, p_team_number: 3, p_slot: 'a', p_name: 'G' }), 'invalid_team');
  const g1 = await rpc(org.jwt, 'organizer_add_guest_to_team', { p_event_id: ev, p_team_number: 1, p_slot: 'b', p_name: 'Guest One' });
  const [t1] = await sel('event_teams', `event_id=eq.${ev}&team_number=eq.1&select=player_a_id,player_b_id,is_confirmed`);
  assert(t1.player_b_id === g1 && t1.is_confirmed, 'guest in slot b, team confirmed');
  assert((await part(ev, a)).status === 'confirmed', 'the partner is confirmed with them');
  await rpc(org.jwt, 'organizer_add_guest_to_team', { p_event_id: ev, p_team_number: 2, p_slot: 'a', p_name: 'Guest Two' });
  const lone = (await rows(ev)).find((r) => r.guest_name === 'Guest Two');
  assert(lone.status === 'confirmed', 'a lone guest is confirmed in their slot');
  await rpc(org.jwt, 'organizer_add_guest_to_team', { p_event_id: ev, p_team_number: 2, p_slot: 'b', p_name: 'Guest Three' });
  await expectError(() => rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Over' }), 'event_full');
  assert((await activity(ev, 'guest_added')).length === 3, 'three guest_added rows');
});

// ---------------------------------------------------------------------------------------------
// D13 + D14 + B13: create / update
// ---------------------------------------------------------------------------------------------
await run('D13: courts_reserved — stored at creation, set by picking courts', async () => {
  const org = await user('d13-org');
  const ev = await privateEvent(org, [], { courts_reserved: false });
  assert((await eventRow(ev)).courts_reserved === false, 'not reserved');
  assert((await eventRow(await privateEvent(org))).courts_reserved === true, 'default reserved');
  const base = { ...payload(null, {}), name: 'D13', starts_at: hoursFromNow(72) };
  await rpc(org.jwt, 'update_event', { p_event_id: ev, p_payload: base });
  assert((await eventRow(ev)).courts_reserved === false, 'an unrelated edit keeps it');
  await rpc(org.jwt, 'update_event', { p_event_id: ev, p_payload: { ...base, courts_reserved: true } });
  assert((await eventRow(ev)).courts_reserved === true, 'the key sets it');
  await expectError(() => rpc(org.jwt, 'update_event', { p_event_id: ev, p_payload: { ...base, court_ids: [crypto.randomUUID()] } }), 'invalid_courts');
});

await run('D14: private → public on a group event; group-less stays private; organizer_role ignored', async () => {
  const [inv, other, joined] = [await user('d14-inv'), await user('d14-oth'), await user('d14-j')];
  const { admin, groupId } = await group('d14', [inv, other, joined]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId, { is_private: true, invitees: invitees(inv, joined) }) });
  await rpc(joined.jwt, 'accept_event_invitation', { p_event_id: ev });
  const base = { ...payload(groupId, {}), name: 'D14', starts_at: hoursFromNow(72) };
  await rpc(admin.jwt, 'update_event', { p_event_id: ev, p_payload: { ...base, is_private: false, organizer_role: 'organizing_and_playing' } });
  const row = await eventRow(ev);
  assert(row.is_private === false && row.organizer_role === 'organizing_only', 'public now; the role did not change');
  assert((await invs(ev)).every((i) => i.status !== 'pending'), 'pending invitations deleted');
  assert((await notifs(inv, 'event_invite', ev)).length === 0 && (await notifs(inv, 'event_created', ev)).length === 1, "the invitee's notice became event_created");
  assert((await notifs(other, 'event_created', ev)).length === 1, 'another member is told');
  assert((await notifs(joined, 'event_created', ev)).length === 0, 'a participant is not');
  const rk = await activity(ev, 'ranking_changed');
  assert(rk.length === 1 && rk[0].detail.enabled === true, 'going public counts for the ranking — logged');
  assert((await activity(ev, 'event_edited'))[0].detail.changes.includes('preferences'), 'privacy is a preferences edit');

  const org = await user('d14-solo');
  const solo = await privateEvent(org);
  await expectError(() => rpc(org.jwt, 'update_event', { p_event_id: solo, p_payload: { ...payload(null, {}), name: 'Solo', is_private: false } }), 'standalone_must_be_private');
});

await run('B13: growing the courts offers the new spots to the waiting list', async () => {
  const { org, ev } = await withPlayers('b13', 4);
  const w = await user('b13-w');
  await invite(ev, org, w);
  assert((await rpc(w.jwt, 'accept_event_invitation', { p_event_id: ev })) === 'waiting_list', 'waits');
  const before = (await notifs(w, 'waitlist_spot', ev)).length;
  await rpc(org.jwt, 'update_event', { p_event_id: ev, p_payload: { ...payload(null, {}), name: 'B13', num_courts: 2, starts_at: hoursFromNow(72) } });
  assert((await notifs(w, 'waitlist_spot', ev)).length === before + 1, 'the waiter is offered a spot');
  assert((await rpc(w.jwt, 'claim_waitlist_spot', { p_event_id: ev })) === 'confirmed', 'and can claim it');
});

// ---------------------------------------------------------------------------------------------
// D15 + B11: activity
// ---------------------------------------------------------------------------------------------
await run('D15/B11: the log is written server-side for what players and the event do', async () => {
  await expectError(async () => rpc((await user('d15-x')).jwt, 'log_event_activity', { p_event_id: crypto.randomUUID(), p_action: 'joined', p_detail: {} }), 'log_event_activity');

  const { admin, groupId } = await group('d15');
  const ps = [];
  for (let i = 0; i < 5; i++) ps.push(await user(`d15-p${i}`));
  for (const p of ps) {
    const [{ community_id: cid }] = await sel('groups', `id=eq.${groupId}&select=community_id`);
    await insert('community_members', { community_id: cid, user_id: p.id, role: 'member' });
    await insert('group_members', { group_id: groupId, user_id: p.id });
  }
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId, { is_private: true, invitees: invitees(...ps), players_submit_results: true }) });
  const [p0, p1, p2, p3] = ps;
  await rpc(p0.jwt, 'accept_event_invitation', { p_event_id: ev });
  await rpc(p1.jwt, 'decline_event_invitation', { p_event_id: ev });
  await rpc(admin.jwt, 'invite_to_event', { p_event_id: ev, p_invitees: invitees(p1) });   // skipped: already invited
  await rpc(p2.jwt, 'accept_event_invitation', { p_event_id: ev });
  await rpc(p3.jwt, 'accept_event_invitation', { p_event_id: ev });
  await rpc(p2.jwt, 'leave_event', { p_event_id: ev });
  await rpc(p2.jwt, 'accept_event_invitation', { p_event_id: ev });                        // p4 stays invited
  const guest = await rpc(admin.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Guest' });   // full: 4 confirmed
  const late = await user('d15-late');
  const [{ community_id: cid }] = await sel('groups', `id=eq.${groupId}&select=community_id`);
  await insert('community_members', { community_id: cid, user_id: late.id, role: 'member' });
  await insert('group_members', { group_id: groupId, user_id: late.id });
  await rpc(admin.jwt, 'invite_to_event', { p_event_id: ev, p_invitees: invitees(late) });
  assert((await rpc(late.jwt, 'accept_event_invitation', { p_event_id: ev })) === 'waiting_list', 'late waits');
  await rpc(admin.jwt, 'organizer_remove_participant', { p_participant_id: guest, p_mode: 'from_event' });
  assert((await rpc(late.jwt, 'claim_waitlist_spot', { p_event_id: ev })) === 'confirmed', 'late claims');

  const log = await activity(ev);
  const has = (action, actor) => log.some((r) => r.action === action && (actor === undefined || r.actor_id === actor.id));
  assert(log.filter((r) => r.action === 'invited').length === 6, `six invitations logged, got ${log.filter((r) => r.action === 'invited').length}`);
  assert(has('invite_accepted', p0) && has('invite_declined', p1), 'accept / decline by the invitee');
  assert(has('joined', p0) && has('left', p2) && log.filter((r) => r.action === 'joined' && r.actor_id === p2.id).length === 2, 'joined / left / joined again');
  assert(has('guest_added', admin) && has('removed', admin), 'organizer tools');
  assert(has('waitlist_joined', late) && has('waitlist_claimed', late), 'waiting list');

  // The event itself.
  await rpc(admin.jwt, 'start_event', { p_event_id: ev, p_rounds: null });
  const all = await matches(ev);
  await rpc(p0.jwt, 'submit_score', { p_match_id: all[0].id, p_side_a: 14, p_side_b: 10 });
  await rpc(admin.jwt, 'submit_score', { p_match_id: all[0].id, p_side_a: 15, p_side_b: 9 });
  await rpc(admin.jwt, 'finish_event', { p_event_id: ev, p_finish_message: null, p_counts_override: null });
  const log2 = await activity(ev);
  const acts = log2.map((r) => r.action);
  for (const a of ['event_started', 'score_entered', 'score_edited', 'event_finished', 'results_published']) {
    assert(acts.includes(a), `${a} logged`);
  }
  assert(log2.find((r) => r.action === 'score_entered').actor_id === p0.id, 'score entered by the player');
  assert(log2.find((r) => r.action === 'score_edited').actor_id === admin.id, 'edited by the organizer');
});

await run('D15: set_event_ranking logs ranking_changed', async () => {
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(await user(`d15r-p${i}`));
  const { admin, groupId } = await group('d15r', ps);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId, { is_private: false }) });
  for (const p of ps) await rpc(p.jwt, 'join_event', { p_event_id: ev });
  await rpc(admin.jwt, 'start_event', { p_event_id: ev });
  await rpc(admin.jwt, 'finish_event', { p_event_id: ev, p_finish_message: null, p_counts_override: null });
  await rpc(admin.jwt, 'set_event_ranking', { p_event_id: ev, p_enabled: false });
  const rk = await activity(ev, 'ranking_changed');
  assert(rk.length === 1 && rk[0].detail.enabled === false && rk[0].actor_id === admin.id, 'ranking_changed by the organizer');
});

await run('D15: team events log partner invitations; not played; cancel', async () => {
  const org = await user('d15t-org');
  const [a, b, c] = [await user('d15t-a'), await user('d15t-b'), await user('d15t-c')];
  const ev = await privateEvent(org, [a, b, c], { specification: 'team' });
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id, c.id] });
  const reqs = await sel('partner_requests', `event_id=eq.${ev}&select=id,target_id`);
  await rpc(c.jwt, 'decline_partner_request', { p_request_id: reqs.find((r) => r.target_id === c.id).id });
  await rpc(b.jwt, 'accept_partner_request', { p_request_id: reqs.find((r) => r.target_id === b.id).id });
  const log = await activity(ev);
  assert(log.filter((r) => r.action === 'partner_invite_sent').length === 2, 'two sent');
  assert(log.some((r) => r.action === 'partner_invite_declined' && r.actor_id === c.id), 'declined by c');
  assert(log.some((r) => r.action === 'partner_invite_accepted' && r.actor_id === b.id), 'accepted by b');
  assert(log.filter((r) => r.action === 'joined').length === 2, 'both halves joined');

  const { org: o2, ev: e2 } = await withPlayers('d15n', 4);
  await rpc(o2.jwt, 'start_event', { p_event_id: e2 });
  const [m] = await matches(e2);
  await rpc(o2.jwt, 'submit_score', { p_match_id: m.id, p_side_a: 0, p_side_b: 0, p_not_played: true });
  assert((await activity(e2, 'match_not_played')).length === 1, 'not played');

  const { org: o3, ev: e3 } = await withPlayers('d15c', 1);
  await rpc(o3.jwt, 'cancel_event', { p_event_id: e3, p_scope: 'only_this' });
  assert((await activity(e3, 'event_cancelled')).length === 1, 'cancelled');
});
