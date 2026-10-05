// infra/supabase/tests/manage-integrity.test.mjs
//
// Migration 0121 (UX Audit — Manage Event, plan PR "0121 — manage integrity": B1–B7, B9, D8), through
// PostgREST as the signed-in organizer — the path each of those bugs was open on. Status changes
// that no RPC makes (a cancelled or in-progress event without a real start) are set with a
// service-role PATCH, which 0121 leaves untouched.
import { user, rpc, req, sel, insert, patch, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);

const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Manage ${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: true, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const invitees = (...us) => us.map((u) => ({ invitee_id: u.id, name: null, email: null, phone: null }));

/** A private group-less event (always private) with the given invitees. */
const privateEvent = (org, list = [], over = {}) =>
  rpc(org.jwt, 'create_event', { p_payload: payload(null, { invitees: invitees(...list), ...over }) });

/** Organizer + community on Pro + a public group with `members`. */
async function group(t, members = []) {
  const admin = await user(`${t}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Manage ${t} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const groupId = await rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Manage', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });
  for (const u of members) {
    await insert('community_members', { community_id: communityId, user_id: u.id, role: 'member' });
    await rpc(u.jwt, 'join_group', { p_group_id: groupId, p_ack: true });
  }
  return { admin, groupId };
}

const asUser = (jwt, path, method, body) => req(path, { method, jwt, body, prefer: 'return=representation' });
const eventRow = (ev) => sel('events', `id=eq.${ev}&select=id,status,name,deleted_at,counts_for_ranking`).then((r) => r[0]);
const rows = (ev) => sel('event_participants', `event_id=eq.${ev}&select=id,user_id,guest_name,guest_gender,status,is_standby,has_paid&order=joined_at`);
const part = (ev, u) => sel('event_participants', `event_id=eq.${ev}&user_id=eq.${u.id}&select=id,status`).then((r) => r[0]);
const setStatus = (ev, status) => patch('events', `id=eq.${ev}`, { status });

/** A private classic event with four confirmed players (org does not play). */
async function fullEvent(t, over = {}) {
  const org = await user(`${t}-org`);
  const ps = [];
  for (const i of [0, 1, 2, 3]) ps.push(await user(`${t}-p${i}`));
  const ev = await privateEvent(org, ps, over);
  for (const p of ps) await rpc(p.jwt, 'accept_event_invitation', { p_event_id: ev });
  return { org, ps, ev };
}

// ---------------------------------------------------------------------------------------------
// B1
// ---------------------------------------------------------------------------------------------
await run('B1: the organizer cannot write events directly (PATCH, DELETE, INSERT)', async () => {
  const org = await user('b1-org');
  const ev = await privateEvent(org);
  const before = await eventRow(ev);
  await expectError(() => asUser(org.jwt, `/rest/v1/events?id=eq.${ev}`, 'PATCH', { status: 'completed', counts_for_ranking: true }), 'permission denied');
  await expectError(() => asUser(org.jwt, `/rest/v1/events?id=eq.${ev}`, 'PATCH', { deleted_at: new Date().toISOString() }), 'permission denied');
  await expectError(() => asUser(org.jwt, `/rest/v1/events?id=eq.${ev}`, 'DELETE'), 'permission denied');
  await expectError(() => asUser(org.jwt, '/rest/v1/events', 'POST', {
    organizer_id: org.id, event_type: 'americano', specification: 'classic', scoring_mode: 'points',
    num_courts: 1, starts_at: hoursFromNow(48), duration_minutes: 90, organizer_role: 'organizing_only',
    name: 'Direct', is_private: true, status: 'completed',
  }), 'permission denied');
  const after = await eventRow(ev);
  assert(after.status === before.status && after.deleted_at === null, 'the event is untouched');
  // …and reading it still works.
  const read = await asUser(org.jwt, `/rest/v1/events?id=eq.${ev}&select=id,name`, 'GET');
  assert(read.length === 1 && read[0].name === before.name, 'SELECT still granted');
});

await run('B1: the organizer cannot write event_series directly; the RPCs still can', async () => {
  const { admin, groupId } = await group('b1s');
  const ev = await rpc(admin.jwt, 'create_event', {
    p_payload: payload(groupId, { is_private: false, series: { day_of_week: 3, start_time: '19:00', duration_minutes: 90, invite_lead_days: 7 } }),
  });
  const [{ series_id: seriesId }] = await sel('events', `id=eq.${ev}&select=series_id`);
  assert(seriesId, 'a series was created through create_event');
  await expectError(() => asUser(admin.jwt, `/rest/v1/event_series?id=eq.${seriesId}`, 'PATCH', { is_active: false, group_id: null }), 'permission denied');
  await expectError(() => asUser(admin.jwt, `/rest/v1/event_series?id=eq.${seriesId}`, 'DELETE'), 'permission denied');
  await expectError(() => asUser(admin.jwt, '/rest/v1/event_series', 'POST', {
    group_id: groupId, organizer_id: admin.id, day_of_week: 1, start_time: '19:00', duration_minutes: 90, invite_lead_days: 7,
  }), 'permission denied');
  // SECURITY DEFINER paths are unaffected: materialise, then cancel the series.
  const next = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: ev });
  assert(next && next !== ev, 'materialize_occurrence still inserts events');
  await rpc(admin.jwt, 'cancel_event', { p_event_id: next, p_scope: 'this_and_upcoming' });
  const [s] = await sel('event_series', `id=eq.${seriesId}&select=is_active`);
  assert(s.is_active === false, 'cancel_event still updates event_series');
  assert((await eventRow(next)).status === 'cancelled', 'cancel_event still updates events');
});

// ---------------------------------------------------------------------------------------------
// B2
// ---------------------------------------------------------------------------------------------
await run('B2: roster tools refuse an event that is not scheduled; payments only refuse cancelled', async () => {
  const { org, ps, ev } = await fullEvent('b2');
  const p0 = await part(ev, ps[0]);
  await setStatus(ev, 'in_progress');
  await expectError(() => rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: p0.id, p_mode: 'from_event' }), 'event_not_editable');
  await expectError(() => rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Late guest' }), 'event_not_editable');
  await expectError(() => rpc(org.jwt, 'organizer_mark_confirmed', { p_participant_id: p0.id }), 'event_not_editable');
  assert((await rows(ev)).length === 4, 'nobody removed or added mid-event');
  // Payments are settled during and after the games (plan D16).
  await rpc(org.jwt, 'mark_paid', { p_participant_id: p0.id, p_paid: true });
  await setStatus(ev, 'completed');
  await rpc(org.jwt, 'mark_all_paid', { p_event_id: ev });
  assert((await rows(ev)).every((r) => r.has_paid), 'paid after the event');
  await setStatus(ev, 'cancelled');
  await expectError(() => rpc(org.jwt, 'mark_paid', { p_participant_id: p0.id, p_paid: false }), 'event_not_editable');
  await expectError(() => rpc(org.jwt, 'mark_all_paid', { p_event_id: ev }), 'event_not_editable');
  await expectError(() => rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: p0.id, p_mode: 'to_invited' }), 'event_not_editable');
  // A soft-deleted event is not found.
  await patch('events', `id=eq.${ev}`, { status: 'scheduled', deleted_at: new Date().toISOString() });
  await expectError(() => rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: p0.id, p_mode: 'from_event' }), 'event_not_found');
});

await run('B2: the team tools refuse an event that is not scheduled', async () => {
  const org = await user('b2t-org');
  const [a, b, c, d] = [await user('b2t-a'), await user('b2t-b'), await user('b2t-c'), await user('b2t-d')];
  const ev = await privateEvent(org, [a, b, c, d], { specification: 'team' });
  await rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: b.id });
  await rpc(c.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: d.id });
  const [pa, pc] = [await part(ev, a), await part(ev, c)];
  const teamsBefore = await sel('event_teams', `event_id=eq.${ev}&select=id,player_a_id,player_b_id&order=team_number`);
  await setStatus(ev, 'in_progress');
  await expectError(() => rpc(org.jwt, 'organizer_switch_players', { p_event_id: ev, p_a: pa.id, p_b: pc.id }), 'event_not_editable');
  await expectError(() => rpc(org.jwt, 'organizer_remove_from_team', { p_event_id: ev, p_participant_id: pa.id }), 'event_not_editable');
  await expectError(() => rpc(org.jwt, 'organizer_assign_to_team', { p_event_id: ev, p_participant_id: pa.id, p_team_number: 2, p_slot: 'a' }), 'event_not_editable');
  const teamsAfter = await sel('event_teams', `event_id=eq.${ev}&select=id,player_a_id,player_b_id&order=team_number`);
  assert(JSON.stringify(teamsAfter) === JSON.stringify(teamsBefore), 'teams unchanged');
});

// ---------------------------------------------------------------------------------------------
// B3
// ---------------------------------------------------------------------------------------------
await run('B3: switch_players / remove_from_team refuse a participant of another event', async () => {
  const org = await user('b3-org');
  const [a, b, c, d] = [await user('b3-a'), await user('b3-b'), await user('b3-c'), await user('b3-d')];
  const ev1 = await privateEvent(org, [a, b], { specification: 'team' });
  const ev2 = await privateEvent(org, [c, d], { specification: 'team' });
  await rpc(a.jwt, 'choose_partner', { p_event_id: ev1, p_partner_user: b.id });
  await rpc(c.jwt, 'choose_partner', { p_event_id: ev2, p_partner_user: d.id });
  const [pa, pc] = [await part(ev1, a), await part(ev2, c)];
  await expectError(() => rpc(org.jwt, 'organizer_switch_players', { p_event_id: ev1, p_a: pa.id, p_b: pc.id }), 'participant_not_found');
  await expectError(() => rpc(org.jwt, 'organizer_switch_players', { p_event_id: ev1, p_a: pc.id, p_b: pc.id }), 'participant_not_found');
  await expectError(() => rpc(org.jwt, 'organizer_remove_from_team', { p_event_id: ev1, p_participant_id: pc.id }), 'participant_not_found');
  const t2 = await sel('event_teams', `event_id=eq.${ev2}&select=player_a_id,player_b_id`);
  assert(t2.length === 1 && [t2[0].player_a_id, t2[0].player_b_id].includes(pc.id), 'the other event\'s team is intact');
  assert((await part(ev2, c)).status === 'confirmed', 'the other event\'s player is still confirmed');
});

// ---------------------------------------------------------------------------------------------
// B4
// ---------------------------------------------------------------------------------------------
await run('B4: add_manual_participant — name rules, capacity, stand-by', async () => {
  const org = await user('b4-org');
  const ev = await privateEvent(org, [], { allow_standby: true, standby_spots: 1 });
  await expectError(() => rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: '   ' }), 'name_required');
  await expectError(() => rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'x'.repeat(61) }), 'invalid_guest_name');
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: `  ${'y'.repeat(60)}  ` });
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Guest 2', p_gender: 'other' });
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Guest 3', p_gender: 'female' });
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Guest 4' });
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Stand-by' });
  await expectError(() => rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'One too many' }), 'event_full');
  const r = await rows(ev);
  assert(r.length === 5 && r.every((x) => x.status === 'confirmed'), 'four + one stand-by');
  assert(r[0].guest_name === 'y'.repeat(60), 'the name is trimmed');
  assert(r.find((x) => x.guest_name === 'Guest 2').guest_gender === null, "'other' is stored as no gender");
  assert(r.find((x) => x.guest_name === 'Guest 3').guest_gender === 'female', 'a real gender is kept');
  assert(r.filter((x) => x.is_standby).map((x) => x.guest_name).join() === 'Stand-by', 'only the fifth is stand-by');
});

await run('B4: add_manual_participant on a mixed event — gender required and per-gender halves', async () => {
  const org = await user('b4m-org');
  const ev = await privateEvent(org, [], { specification: 'mixed' });
  await expectError(() => rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'No gender' }), 'guest_gender_required');
  await expectError(() => rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'Other', p_gender: 'other' }), 'guest_gender_required');
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'W1', p_gender: 'female' });
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'W2', p_gender: 'female' });
  await expectError(() => rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'W3', p_gender: 'female' }), 'gender_full');
  await rpc(org.jwt, 'add_manual_participant', { p_event_id: ev, p_name: 'M1', p_gender: 'male' });
  assert((await rows(ev)).length === 3, 'two women and one man');
});

// ---------------------------------------------------------------------------------------------
// B5
// ---------------------------------------------------------------------------------------------
await run('B5: mark_all_paid pays confirmed participants only', async () => {
  const { org, ev } = await fullEvent('b5');
  const waiter = await user('b5-w');
  const [{ id: inv }] = await insert('event_invitations', { event_id: ev, invitee_id: waiter.id, invited_by: org.id });
  assert(inv, 'invited');
  assert((await rpc(waiter.jwt, 'accept_event_invitation', { p_event_id: ev })) === 'waiting_list', 'the fifth waits');
  await rpc(org.jwt, 'mark_all_paid', { p_event_id: ev });
  const r = await rows(ev);
  assert(r.filter((x) => x.status === 'confirmed').every((x) => x.has_paid), 'confirmed are paid');
  assert(r.find((x) => x.user_id === waiter.id).has_paid === false, 'the waiter is not');
});

// ---------------------------------------------------------------------------------------------
// B6
// ---------------------------------------------------------------------------------------------
await run('B6: finish_event requires an event in progress', async () => {
  const { org, ev } = await fullEvent('b6');
  await expectError(() => rpc(org.jwt, 'finish_event', { p_event_id: ev, p_finish_message: null, p_counts_override: null }), 'event_not_in_progress');
  assert((await eventRow(ev)).status === 'scheduled', 'a scheduled event is not completed');
  await setStatus(ev, 'cancelled');
  await expectError(() => rpc(org.jwt, 'finish_event', { p_event_id: ev, p_finish_message: null, p_counts_override: null }), 'event_not_in_progress');
  assert((await eventRow(ev)).status === 'cancelled', 'a cancelled event stays cancelled');

  const b = await fullEvent('b6b');
  await rpc(b.org.jwt, 'start_event', { p_event_id: b.ev });
  await rpc(b.org.jwt, 'finish_event', { p_event_id: b.ev, p_finish_message: null, p_counts_override: null });
  assert((await eventRow(b.ev)).status === 'completed', 'an event in progress finishes');
  await expectError(() => rpc(b.org.jwt, 'finish_event', { p_event_id: b.ev, p_finish_message: 'again', p_counts_override: null }), 'event_not_in_progress');
});

// ---------------------------------------------------------------------------------------------
// B7
// ---------------------------------------------------------------------------------------------
await run('B7: joins racing start_event never land outside round 1', async () => {
  // 4 confirmed + room for 4 stand-by. Fire start and four invitation accepts at once, several
  // times. Whatever the interleaving, every confirmed player must be in round 1 (4 playing, the
  // rest resting): a join that committed after start counted the roster would be neither.
  for (let i = 0; i < 3; i++) {
    const late = [];
    for (const j of [0, 1, 2, 3]) late.push(await user(`b7-${i}-l${j}`));
    const { org, ev } = await fullEvent(`b7-${i}`, { allow_standby: true, standby_spots: 4 });
    for (const u of late) await insert('event_invitations', { event_id: ev, invitee_id: u.id, invited_by: org.id });
    await Promise.allSettled([
      rpc(org.jwt, 'start_event', { p_event_id: ev }),
      ...late.map((u) => rpc(u.jwt, 'accept_event_invitation', { p_event_id: ev })),
    ]);
    assert((await eventRow(ev)).status === 'in_progress', 'the event started');
    const confirmed = (await rows(ev)).filter((x) => x.status === 'confirmed').length;
    const [round] = await sel('event_rounds', `event_id=eq.${ev}&round_number=eq.1&select=id`);
    const resting = (await sel('round_rest', `round_id=eq.${round.id}&select=participant_id`)).length;
    assert(confirmed === 4 + resting, `run ${i}: ${confirmed} confirmed but ${4 + resting} in round 1`);
  }
  // …and after the start every self-join path is closed.
  const { org, ev } = await fullEvent('b7-after', { allow_standby: true, standby_spots: 4 });
  const late = await user('b7-after-l');
  await insert('event_invitations', { event_id: ev, invitee_id: late.id, invited_by: org.id });
  await rpc(org.jwt, 'start_event', { p_event_id: ev });
  await expectError(() => rpc(late.jwt, 'accept_event_invitation', { p_event_id: ev }), 'event_closed');
  await expectError(() => rpc(late.jwt, 'join_event', { p_event_id: ev }), 'event_closed');
});

// ---------------------------------------------------------------------------------------------
// D8 + B9
// ---------------------------------------------------------------------------------------------
await run('D8: the organizer may join their own private event without an invitation', async () => {
  const org = await user('d8-org');
  const a = await user('d8-a');
  const ev = await privateEvent(org, [a]);
  const outsider = await user('d8-out');
  await expectError(() => rpc(outsider.jwt, 'join_event', { p_event_id: ev }), 'not_invited');
  assert((await rpc(org.jwt, 'join_event', { p_event_id: ev })) === 'confirmed', 'organizer joins');
  assert((await sel('event_invitations', `event_id=eq.${ev}&invitee_id=eq.${org.id}&select=id`)).length === 0, 'no self-invitation');
  await expectError(() => rpc(org.jwt, 'join_event', { p_event_id: ev }), 'already_joined');
  // The 6 h cut-off still applies to the organizer (see the migration header).
  const late = await privateEvent(org, [a]);
  await patch('events', `id=eq.${late}`, { starts_at: hoursFromNow(5) });
  await expectError(() => rpc(org.jwt, 'join_event', { p_event_id: late }), 'event_closed');
});

await run('D8: the organizer may enter the team flow of their own private team event', async () => {
  const org = await user('d8t-org');
  const a = await user('d8t-a');
  const ev = await privateEvent(org, [a], { specification: 'team' });
  const candidates = await rpc(org.jwt, 'event_partner_candidates', { p_event_id: ev });
  assert(candidates.some((c) => c.id === a.id), 'the organizer can list partners');
  assert((await rpc(org.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: a.id })) === 'confirmed', 'organizer pairs up');
  assert((await sel('event_teams', `event_id=eq.${ev}&select=id`)).length === 1, 'one team');
});

await run('D8: the organizer may join a public group event they are not a member of', async () => {
  const { admin, groupId } = await group('d8g');
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId, { is_private: false }) });
  // The admin created the group; take them out so only the organizer rule lets them in.
  await req(`/rest/v1/group_members?group_id=eq.${groupId}&user_id=eq.${admin.id}`, { method: 'DELETE' });
  assert((await rpc(admin.jwt, 'join_event', { p_event_id: ev })) === 'confirmed', 'organizer joins');
  assert((await sel('group_members', `group_id=eq.${groupId}&user_id=eq.${admin.id}&select=user_id`)).length === 0, 'not re-added to the group');
});

await run('B9: duplicate_event seats an organizer who plays', async () => {
  const org = await user('b9d-org');
  const a = await user('b9d-a');
  const ev = await privateEvent(org, [a], { organizer_role: 'organizing_and_playing' });
  const copy = await rpc(org.jwt, 'duplicate_event', { p_event_id: ev, p_overrides: { starts_at: hoursFromNow(96) } });
  const seat = await part(copy, org);
  assert(seat && seat.status === 'confirmed', 'organizer confirmed in the copy');
  const only = await privateEvent(org, [a]);
  const copy2 = await rpc(org.jwt, 'duplicate_event', { p_event_id: only, p_overrides: { starts_at: hoursFromNow(96) } });
  assert(!(await part(copy2, org)), 'an organizing-only organizer is not seated');
});

await run('B9: a materialised occurrence seats the playing organizer; a private one lets a non-playing organizer join', async () => {
  const member = await user('b9m-m');
  const { admin, groupId } = await group('b9m', [member]);
  const weekly = { day_of_week: 3, start_time: '19:00', duration_minutes: 90, invite_lead_days: 7 };
  const playing = await rpc(admin.jwt, 'create_event', {
    p_payload: payload(groupId, { is_private: false, organizer_role: 'organizing_and_playing', series: weekly }),
  });
  const next = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: playing });
  const seat = await part(next, admin);
  assert(seat && seat.status === 'confirmed', 'organizer confirmed in the next occurrence');

  const priv = await rpc(admin.jwt, 'create_event', {
    p_payload: payload(groupId, { is_private: true, invitees: invitees(member), series: weekly }),
  });
  const nextPriv = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: priv });
  assert(!(await part(nextPriv, admin)), 'an organizing-only organizer is not seated');
  assert((await rpc(admin.jwt, 'join_event', { p_event_id: nextPriv })) === 'confirmed', 'but can join without an invitation');
});
