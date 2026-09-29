// infra/supabase/tests/event-guests.test.mjs
//
// Migration 0113 (UX Audit — Events, plan PR 3): guest players in create_event (D7, UX-CEVT-11),
// choose_guest_partner (UX-JEVT-10), manual court names (UX-CEVT-06), soft-deleted venues, the
// dropped contact-only invitation path (B12), and guests never reaching the group ranking.
import { user, rpc, sel, insert, patch, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);

const base = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Guests ${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: true, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const invitees = (...us) => us.map((u) => ({ invitee_id: u.id }));
const create = (org, over) => rpc(org.jwt, 'create_event', { p_payload: base(null, over) });
const guestRows = (ev) =>
  sel('event_participants', `event_id=eq.${ev}&user_id=is.null&select=id,guest_name,guest_gender,status,is_standby,invited_by,waiting_list_position,pair_participant_id&order=joined_at,id`);
const part = (ev, u) =>
  sel('event_participants', `event_id=eq.${ev}&user_id=eq.${u.id}&select=id,status,waiting_list_position,pair_participant_id`)
    .then((r) => r[0] ?? null);
const teams = (ev) => sel('event_teams', `event_id=eq.${ev}&select=player_a_id,player_b_id,is_confirmed`);
const eventRow = (ev) => sel('events', `id=eq.${ev}&select=id,num_courts,venue_id,manual_court_names`).then((r) => r[0]);

// ---------------------------------------------------------------------------------------------
// create_event: guests
// ---------------------------------------------------------------------------------------------

await run('create_event: guests are confirmed participants with no account', async () => {
  const org = await user('g-org');
  const ev = await create(org, {
    organizer_role: 'organizing_and_playing', allow_standby: true, standby_spots: 2,
    guests: [{ name: '  Rui  ', gender: 'male' }, { name: 'Marta' }, { name: 'Zé' }, { name: 'Ana' }],
  });
  // One transaction: joined_at ties, so rows are looked up by name, never by order.
  const rows = await guestRows(ev);
  const byName = Object.fromEntries(rows.map((r) => [r.guest_name, r]));
  assert(rows.length === 4, `4 guests, got ${rows.length}`);
  assert(byName.Rui, 'name trimmed');
  assert(rows.every((r) => r.status === 'confirmed' && r.invited_by === org.id), 'confirmed, added by the organizer');
  assert(rows.every((r) => r.guest_gender === null), 'gender not stored on a classic event');
  // Organizer + 3 guests fill the 4 court spots; the fourth guest (in payload order) is a stand-by.
  assert(rows.filter((r) => r.is_standby).length === 1 && byName.Ana.is_standby, 'the guest past the courts is a stand-by');
  const activity = await sel('event_activity', `event_id=eq.${ev}&action=eq.guest_added&select=id`);
  assert(activity.length === 4, 'guest_added logged per guest');
});

await run('create_event: guest names are 1..60 characters', async () => {
  const org = await user('g-name');
  await expectError(() => create(org, { guests: [{ name: '   ' }] }), 'invalid_guest_name');
  await expectError(() => create(org, { guests: [{ name: 'x'.repeat(61) }] }), 'invalid_guest_name');
  await expectError(() => create(org, { guests: ['Just a string'] }), 'invalid_guest_name');
  await create(org, { guests: [{ name: 'x'.repeat(60) }] });
});

await run('create_event: guests beyond capacity fail the whole creation', async () => {
  const org = await user('g-full');
  const name = `Overfull ${tag()}`;
  await expectError(
    () => create(org, { name, organizer_role: 'organizing_and_playing', guests: [1, 2, 3, 4].map((i) => ({ name: `G${i}` })) }),
    'event_full',
  );
  assert((await sel('events', `name=eq.${encodeURIComponent(name)}&select=id`)).length === 0, 'nothing was created');
});

await run('create_event: mixed guests need a gender and respect each half', async () => {
  const org = await user('g-mix', { gender: 'female' });
  // Its own code: the organizer's profile gender is not what is missing.
  await expectError(() => create(org, { specification: 'mixed', guests: [{ name: 'NoGender' }] }), 'guest_gender_required');
  await expectError(() => create(org, { specification: 'mixed', guests: [{ name: 'Odd', gender: 'other' }] }), 'guest_gender_required');
  // Capacity 4 → 2 per gender. The playing organizer (female) takes one of hers.
  await expectError(
    () => create(org, {
      specification: 'mixed', organizer_role: 'organizing_and_playing',
      guests: [{ name: 'F1', gender: 'female' }, { name: 'F2', gender: 'female' }],
    }),
    'gender_full',
  );
  const ev = await create(org, {
    specification: 'mixed', organizer_role: 'organizing_and_playing',
    guests: [{ name: 'F1', gender: 'female' }, { name: 'M1', gender: 'male' }, { name: 'M2', gender: 'male' }],
  });
  const rows = await guestRows(ev);
  assert(rows.map((r) => r.guest_gender).sort().join() === 'female,male,male', 'gender stored on a mixed event');
});

// ---------------------------------------------------------------------------------------------
// B12: the contact-only invitation path is gone
// ---------------------------------------------------------------------------------------------

await run('B12: a name-only manual invitee no longer fails create_event (it is skipped)', async () => {
  const [org, a] = [await user('b12-org'), await user('b12-a')];
  const ev = await create(org, {
    invitees: [...invitees(a), { invitee_id: null, name: 'Only A Name' }, { name: 'X', email: 'x@example.test', phone: '+351900000000' }],
  });
  const inv = await sel('event_invitations', `event_id=eq.${ev}&select=invitee_id,invitee_name,invitee_email`);
  assert(inv.length === 1 && inv[0].invitee_id === a.id, 'only the platform user is invited');
  assert(inv[0].invitee_name === null && inv[0].invitee_email === null, 'no contact columns written');
  // invite_to_event: same rule, platform users keep working.
  const b = await user('b12-b');
  await rpc(org.jwt, 'invite_to_event', { p_event_id: ev, p_invitees: [{ invitee_id: null, name: 'Nope' }, { invitee_id: b.id }] });
  const after = await sel('event_invitations', `event_id=eq.${ev}&select=invitee_id`);
  assert(after.length === 2 && after.some((r) => r.invitee_id === b.id), 'invite_to_event adds the platform user only');
});

// ---------------------------------------------------------------------------------------------
// Manual court names + venues
// ---------------------------------------------------------------------------------------------

const updatePayload = (over) => ({
  name: 'Edited', description: null, thumbnail_path: null, starts_at: hoursFromNow(72), duration_minutes: 90,
  scoring_mode: 'points', scoring_value: 24, allow_standby: false, standby_spots: null, is_private: true,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  players_submit_results: false, organizer_role: 'organizing_only', num_courts: 1,
  venue_id: null, manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null, ...over,
});

await run('manual_court_names: one trimmed name per court, manual venues only', async () => {
  const org = await user('mcn-org');
  const ev = await create(org, { num_courts: 2, manual_court_names: [' Central ', 'Court B'] });
  assert(JSON.stringify((await eventRow(ev)).manual_court_names) === '["Central","Court B"]', 'stored trimmed, in order');
  assert((await eventRow(await create(org, {}))).manual_court_names === null, 'null when none given');
  assert((await eventRow(await create(org, { manual_court_names: null }))).manual_court_names === null, 'explicit null ok');
  await expectError(() => create(org, { num_courts: 2, manual_court_names: ['Only one'] }), 'invalid_court_names');
  await expectError(() => create(org, { num_courts: 1, manual_court_names: [] }), 'invalid_court_names');
  await expectError(() => create(org, { num_courts: 1, manual_court_names: [' '] }), 'invalid_court_names');
  await expectError(() => create(org, { num_courts: 1, manual_court_names: ['x'.repeat(41)] }), 'invalid_court_names');
  await expectError(() => create(org, { num_courts: 1, manual_court_names: 'Central' }), 'invalid_court_names');
  const [venue] = await insert('venues', { name: `Venue ${tag()}`, address: 'Rua 1', created_by: org.id });
  await expectError(
    () => create(org, { venue_id: venue.id, manual_location_name: null, manual_location_address: null, manual_court_names: ['A'] }),
    'invalid_court_names',
  );
  // The table check holds names to the same rule, whoever writes them.
  await expectError(() => patch('events', `id=eq.${ev}`, { manual_court_names: ['Central', '  '] }), '23514');
  await expectError(() => patch('events', `id=eq.${ev}`, { manual_court_names: ['Central', null] }), '23514');
});

await run('manual_court_names: update_event keeps names that fit and clears ones that no longer do', async () => {
  const org = await user('mcn-upd');
  const ev = await create(org, { num_courts: 2, manual_court_names: ['A', 'B'] });
  await rpc(org.jwt, 'update_event', { p_event_id: ev, p_payload: updatePayload({ num_courts: 2, name: 'Renamed' }) });
  assert(JSON.stringify((await eventRow(ev)).manual_court_names) === '["A","B"]', 'kept when the court count is unchanged');
  await rpc(org.jwt, 'update_event', { p_event_id: ev, p_payload: updatePayload({ num_courts: 3 }) });
  assert((await eventRow(ev)).manual_court_names === null, 'cleared when update_event changes num_courts');
  const ev2 = await create(org, { num_courts: 1, manual_court_names: ['Solo'] });
  const [venue] = await insert('venues', { name: `Venue ${tag()}`, address: 'Rua 1', created_by: org.id });
  await rpc(org.jwt, 'update_event', {
    p_event_id: ev2, p_payload: updatePayload({ venue_id: venue.id, manual_location_name: null, manual_location_address: null }),
  });
  assert((await eventRow(ev2)).manual_court_names === null, 'cleared when a registry venue is picked');
});


await run('venues: a soft-deleted venue cannot be picked, but an event already on it stays editable', async () => {
  const org = await user('ven-org');
  const [live] = await insert('venues', { name: `Live ${tag()}`, address: 'Rua 1', created_by: org.id });
  const [gone] = await insert('venues', { name: `Gone ${tag()}`, address: 'Rua 2', created_by: org.id, deleted_at: new Date().toISOString() });
  const onVenue = { manual_location_name: null, manual_location_address: null };
  await expectError(() => create(org, { venue_id: gone.id, ...onVenue }), 'venue_not_found');
  await expectError(() => create(org, { venue_id: '00000000-0000-0000-0000-000000000000', ...onVenue }), 'venue_not_found');
  const ev = await create(org, { venue_id: live.id, ...onVenue });
  await expectError(
    () => rpc(org.jwt, 'update_event', { p_event_id: ev, p_payload: updatePayload({ venue_id: gone.id, ...onVenue }) }),
    'venue_not_found',
  );
  // The event's own venue is deleted afterwards: re-sending it with other edits still works.
  await patch('venues', `id=eq.${live.id}`, { deleted_at: new Date().toISOString() });
  await rpc(org.jwt, 'update_event', { p_event_id: ev, p_payload: updatePayload({ venue_id: live.id, name: 'Still editable', ...onVenue }) });
  assert((await sel('events', `id=eq.${ev}&select=name`))[0].name === 'Still editable', 'edit went through');
  // Moving to a manual location is always fine.
  await rpc(org.jwt, 'update_event', { p_event_id: ev, p_payload: updatePayload({}) });
});

// ---------------------------------------------------------------------------------------------
// choose_guest_partner
// ---------------------------------------------------------------------------------------------

await run('choose_guest_partner: the pair is confirmed with a team row; gates as choose_partner', async () => {
  const [org, a, b, outsider] = [await user('cgp-org'), await user('cgp-a'), await user('cgp-b'), await user('cgp-out')];
  const ev = await create(org, { specification: 'team', invitees: invitees(a, b) });
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] });
  await expectError(() => rpc(a.jwt, 'choose_guest_partner', { p_event_id: ev, p_name: ' ' }), 'invalid_guest_name');
  await expectError(() => rpc(outsider.jwt, 'choose_guest_partner', { p_event_id: ev, p_name: 'Friend' }), 'forbidden');
  assert((await rpc(a.jwt, 'choose_guest_partner', { p_event_id: ev, p_name: '  Friend  ' })) === 'confirmed', 'confirmed');
  const [g] = await guestRows(ev);
  const me = await part(ev, a);
  assert(g.guest_name === 'Friend' && g.status === 'confirmed' && g.invited_by === a.id, 'guest row, added by the player');
  assert(me.status === 'confirmed', 'caller confirmed');
  const t = await teams(ev);
  assert(t.length === 1 && t[0].is_confirmed && [t[0].player_a_id, t[0].player_b_id].sort().join() === [me.id, g.id].sort().join(), 'a confirmed team of the two');
  assert((await sel('event_invitations', `event_id=eq.${ev}&invitee_id=eq.${a.id}&select=status`))[0].status === 'accepted', 'invitation answered');
  const req = await sel('partner_requests', `event_id=eq.${ev}&requester_id=eq.${a.id}&select=status,closed_by_system`);
  assert(req[0].status === 'declined' && req[0].closed_by_system, 'pending asks closed by the system');
  await expectError(() => rpc(a.jwt, 'choose_guest_partner', { p_event_id: ev, p_name: 'Another' }), 'already_joined');
  const classic = await create(org, { invitees: invitees(b) });
  await expectError(() => rpc(b.jwt, 'choose_guest_partner', { p_event_id: classic, p_name: 'Friend' }), 'not_a_team_event');
  const soon = await create(org, { specification: 'team', invitees: invitees(b), starts_at: hoursFromNow(3) });
  await expectError(() => rpc(b.jwt, 'choose_guest_partner', { p_event_id: soon, p_name: 'Friend' }), 'event_closed');
});

await run('choose_guest_partner: on a full event the pair waits together; leaving removes the guest', async () => {
  const p = [];
  for (const i of [0, 1, 2, 3, 4, 5]) p.push(await user(`cgw-${i}`));
  const org = await user('cgw-org');
  const ev = await create(org, { specification: 'team', invitees: invitees(...p) }); // capacity 4 = two pairs
  assert((await rpc(p[0].jwt, 'choose_guest_partner', { p_event_id: ev, p_name: 'Guest Zero' })) === 'confirmed', 'pair 1');
  assert((await rpc(p[1].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[2].id })) === 'confirmed', 'pair 2');

  assert((await rpc(p[3].jwt, 'choose_guest_partner', { p_event_id: ev, p_name: 'Guest Three' })) === 'waiting_list', 'pair 3 waits');
  const me = await part(ev, p[3]);
  const g3 = (await guestRows(ev)).find((r) => r.guest_name === 'Guest Three');
  assert(me.status === 'waiting_list' && g3.status === 'waiting_list', 'both waiting');
  assert(me.waiting_list_position === 1 && g3.waiting_list_position === 2, 'consecutive positions');
  assert(me.pair_participant_id === g3.id && g3.pair_participant_id === me.id, 'linked as a waiting pair');
  assert((await teams(ev)).length === 2, 'no team row for a waiting pair');

  // A waiting pair with a guest leaves together.
  assert((await rpc(p[4].jwt, 'choose_guest_partner', { p_event_id: ev, p_name: 'Guest Four' })) === 'waiting_list', 'pair 4 waits');
  await rpc(p[4].jwt, 'leave_waiting_list', { p_event_id: ev });
  assert(!(await guestRows(ev)).some((r) => r.guest_name === 'Guest Four'), 'leave_waiting_list removes the guest');

  // Pair 1 leaves: its guest goes too (no account → no notification), two spots free up.
  await rpc(p[0].jwt, 'leave_event', { p_event_id: ev });
  assert(!(await guestRows(ev)).some((r) => r.guest_name === 'Guest Zero'), 'leave_event removes the guest partner');
  const offers = await sel('notifications', `user_id=eq.${p[3].id}&type=eq.waitlist_spot&event_id=eq.${ev}&select=id`);
  assert(offers.length === 1, 'the waiting player is offered the spots');

  // B8: two spots are free but a pair waits → a newcomer's guest pair queues behind it.
  assert((await rpc(p[5].jwt, 'choose_guest_partner', { p_event_id: ev, p_name: 'Guest Five' })) === 'waiting_list', 'queues behind');

  // The waiting player claims for the pair: both confirmed, a team row, link cleared.
  assert((await rpc(p[3].jwt, 'claim_waitlist_spot', { p_event_id: ev })) === 'confirmed', 'claimed');
  const [me2, g3b] = [await part(ev, p[3]), (await guestRows(ev)).find((r) => r.guest_name === 'Guest Three')];
  assert(me2.status === 'confirmed' && g3b.status === 'confirmed' && g3b.pair_participant_id === null, 'pair confirmed');
  assert((await teams(ev)).some((t) => t.is_confirmed && [t.player_a_id, t.player_b_id].includes(g3b.id)), 'team row with the guest');
  assert((await part(ev, p[5])).waiting_list_position === 1, 'queue renumbered');

  // 0122 (D2): the organizer cannot confirm a waiting player — the waiting pair stays as it is.
  assert((await rpc(p[4].jwt, 'choose_guest_partner', { p_event_id: ev, p_name: 'Guest Four Again' })) === 'waiting_list', 'another pair waits');
  await expectError(async () => rpc(org.jwt, 'organizer_mark_confirmed', { p_participant_id: (await part(ev, p[4])).id }), 'waitlist_not_confirmable');
  assert((await part(ev, p[4])).status === 'waiting_list', 'still waiting');
  assert((await guestRows(ev)).some((r) => r.guest_name === 'Guest Four Again'), 'the waiting guest half is kept');

  // The organizer removes a waiting player: their guest half is deleted, not left 'interested'.
  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: (await part(ev, p[5])).id, p_mode: 'from_event' });
  assert(!(await guestRows(ev)).some((r) => r.guest_name === 'Guest Five'), 'stranded guest half deleted');
});

await run('organizer removal of a paired player takes their confirmed guest partner too', async () => {
  const [a, b, c] = [await user('orm-a'), await user('orm-b'), await user('orm-c')];
  const org = await user('orm-org');
  const ev = await create(org, {
    specification: 'team', organizer_role: 'organizing_and_playing', invitees: invitees(a, b, c),
    guests: [{ name: 'Org Guest' }],
  });
  assert((await rpc(a.jwt, 'choose_guest_partner', { p_event_id: ev, p_name: 'A Guest' })) === 'confirmed', 'a pairs with a guest');
  const orgGuest = (await guestRows(ev)).find((r) => r.guest_name === 'Org Guest');
  // An organizer-added guest teamed (by the organizer) with b stays when b is removed.
  await rpc(org.jwt, 'organizer_assign_to_team', { p_event_id: ev, p_participant_id: orgGuest.id, p_team_number: 2, p_slot: 'a' });
  await rpc(b.jwt, 'request_partner', { p_event_id: ev, p_targets: [] });
  await rpc(org.jwt, 'organizer_assign_to_team', { p_event_id: ev, p_participant_id: (await part(ev, b)).id, p_team_number: 2, p_slot: 'b' });

  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: (await part(ev, a)).id, p_mode: 'from_event' });
  const left = await guestRows(ev);
  assert(!left.some((r) => r.guest_name === 'A Guest'), "the removed player's guest is deleted");
  assert(left.some((r) => r.guest_name === 'Org Guest'), 'other guests untouched');
  const t = await teams(ev);
  assert(!t.some((x) => x.is_confirmed && x.player_a_id === null && x.player_b_id === null), 'no confirmed empty team left');

  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: (await part(ev, b)).id, p_mode: 'from_event' });
  assert((await guestRows(ev)).some((r) => r.guest_name === 'Org Guest'), "a guest the player did not bring stays the organizer's");
});

await run('choose_guest_partner: a confirmed organizer who plays is never demoted into the queue', async () => {
  const p = [];
  for (const i of [0, 1, 2, 3]) p.push(await user(`cgd-${i}`));
  const org = await user('cgd-org');
  const ev = await create(org, {
    specification: 'team', organizer_role: 'organizing_and_playing', allow_standby: true, standby_spots: 1,
    invitees: invitees(...p),
  }); // capacity 5
  assert((await rpc(p[0].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[1].id })) === 'confirmed', 'pair 1');
  assert((await rpc(p[2].jwt, 'choose_partner', { p_event_id: ev, p_partner_user: p[3].id })) === 'confirmed', 'pair 2');
  // Organizer (confirmed, no team) + two pairs = 5 of 5: a new pair would have to queue.
  await expectError(() => rpc(org.jwt, 'choose_guest_partner', { p_event_id: ev, p_name: 'Org Friend' }), 'event_full');
  assert((await part(ev, org)).status === 'confirmed', 'organizer still confirmed');
});

// ---------------------------------------------------------------------------------------------
// Guests never reach the ranking
// ---------------------------------------------------------------------------------------------

await run('finish: guests play and place, but only account holders get ranking rows', async () => {
  const org = await user('rk-org');
  const cid = await rpc(org.jwt, 'create_community_with_personal_tenant', {
    p_name: `Guests Club ${tag()}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [general] = await sel('groups', `community_id=eq.${cid}&is_general=eq.true&select=id`);
  if ((await sel('group_seasons', `group_id=eq.${general.id}&ended_at=is.null&select=id`)).length === 0) {
    await insert('group_seasons', { group_id: general.id, season_number: 1 });
  }
  const p1 = await user('rk-p1');
  const ev = await rpc(org.jwt, 'create_event', {
    p_payload: base(general.id, {
      is_private: false, organizer_role: 'organizing_and_playing', starts_at: hoursFromNow(8),
      guests: [{ name: 'Guest A' }, { name: 'Guest B' }],
    }),
  });
  await rpc(p1.jwt, 'join_group', { p_group_id: general.id });
  assert((await rpc(p1.jwt, 'join_event', { p_event_id: ev })) === 'confirmed', 'a member fills the last spot');
  await rpc(org.jwt, 'start_event', { p_event_id: ev });
  const rounds = await sel('event_rounds', `event_id=eq.${ev}&select=id`);
  const matches = await sel('event_matches', `round_id=eq.${rounds[0].id}&select=id`);
  for (const m of matches) await rpc(org.jwt, 'submit_score', { p_match_id: m.id, p_side_a: 24, p_side_b: 16, p_not_played: false });
  await rpc(org.jwt, 'finish_event', { p_event_id: ev, p_finish_message: null, p_counts_override: true });
  const standings = await rpc(org.jwt, 'standings', { p_event_id: ev });
  assert(standings.length === 4, `guests are placed in the event, got ${standings.length}`);
  const results = await sel('group_event_results', `event_id=eq.${ev}&select=user_id`);
  assert(results.length === 2 && results.every((r) => [org.id, p1.id].includes(r.user_id)), 'ranking rows for the two accounts only');
});

// ---------------------------------------------------------------------------------------------
// Partner requests: notification, invitation answered, event details in the incoming list
// ---------------------------------------------------------------------------------------------

await run('request_partner notifies each target once, answers the invitation, skips blocked targets', async () => {
  const [org, a, b, c] = [await user('prq-org'), await user('prq-a', { name: 'Asker' }), await user('prq-b'), await user('prq-c')];
  const ev = await create(org, { specification: 'team', invitees: invitees(a, b, c) });
  await insert('blocks', { blocker_id: c.id, blocked_id: a.id });
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id, c.id] });
  const [req] = await sel('partner_requests', `event_id=eq.${ev}&requester_id=eq.${a.id}&target_id=eq.${b.id}&select=id`);
  const nb = await sel('notifications', `user_id=eq.${b.id}&type=eq.partner_request&event_id=eq.${ev}&select=actor_id,ref_id,actor_name,entity_name`);
  assert(nb.length === 1 && nb[0].actor_id === a.id && nb[0].ref_id === req.id, 'target told, pointing at the request');
  assert(nb[0].actor_name === 'Asker' && nb[0].entity_name, 'actor and event names carried');
  assert((await sel('notifications', `user_id=eq.${c.id}&type=eq.partner_request&select=id`)).length === 0, 'a blocked target gets nothing');
  const inv = await sel('event_invitations', `event_id=eq.${ev}&invitee_id=eq.${a.id}&select=status`);
  assert(inv[0].status === 'accepted', "the caller's own invitation is answered");
  // Asking again while the request is pending creates nothing new and does not re-notify.
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] });
  assert((await sel('notifications', `user_id=eq.${b.id}&type=eq.partner_request&event_id=eq.${ev}&select=id`)).length === 1, 'no duplicate');
});

await run('incoming_partner_requests carries the event date and location', async () => {
  const [org, a, b] = [await user('ipr-org'), await user('ipr-a'), await user('ipr-b')];
  const [venue] = await insert('venues', { name: `Arena ${tag()}`, address: 'Rua da Arena 1', created_by: org.id });
  const onVenue = { venue_id: venue.id, manual_location_name: null, manual_location_address: null };
  const manual = await create(org, { specification: 'team', invitees: invitees(a, b), manual_location_name: 'Clube', manual_location_address: 'Rua 2' });
  const withVenue = await create(org, { specification: 'team', invitees: invitees(a, b), ...onVenue });
  for (const ev of [manual, withVenue]) await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] });
  const rows = await rpc(b.jwt, 'incoming_partner_requests');
  const m = rows.find((r) => r.entity_id === manual);
  const v = rows.find((r) => r.entity_id === withVenue);
  assert(m && m.starts_at && m.manual_location_name === 'Clube' && m.manual_location_address === 'Rua 2' && m.venue_name === null, 'manual location');
  assert(v && v.venue_name === venue.name && v.venue_address === 'Rua da Arena 1' && v.manual_location_name === null, 'registry venue');
});

// ---------------------------------------------------------------------------------------------
// M5 review: a player left alone in a team slot by an organizer edit can pair again
// ---------------------------------------------------------------------------------------------

await run('a lone team-slot occupant is not "already joined" and can pair again', async () => {
  const [org, a, b, c, d] = [await user('lone-org'), await user('lone-a'), await user('lone-b'), await user('lone-c'), await user('lone-d')];
  const ev = await create(org, { specification: 'team', num_courts: 2, invitees: invitees(a, b, c, d) });
  for (const u of [a, b]) await rpc(u.jwt, 'request_partner', { p_event_id: ev, p_targets: [] });
  await rpc(org.jwt, 'organizer_assign_to_team', { p_event_id: ev, p_participant_id: (await part(ev, a)).id, p_team_number: 1, p_slot: 'a' });
  await rpc(org.jwt, 'organizer_assign_to_team', { p_event_id: ev, p_participant_id: (await part(ev, b)).id, p_team_number: 1, p_slot: 'b' });
  // The organizer takes b out: a is left alone in team 1, status 'invited' (0071 _reconcile_team).
  await rpc(org.jwt, 'organizer_remove_from_team', { p_event_id: ev, p_participant_id: (await part(ev, b)).id });
  const aRow = await part(ev, a);
  assert(aRow.status === 'invited', `a is left invited, got ${aRow.status}`);
  const lone = (await teams(ev)).filter((t) => [t.player_a_id, t.player_b_id].includes(aRow.id));
  assert(lone.length === 1, 'a sits alone in a team slot');

  // The lone player shows up as a candidate and can ask…
  assert((await rpc(c.jwt, 'event_partner_candidates', { p_event_id: ev })).some((x) => x.id === a.id), 'a is a candidate again');
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [c.id] });
  assert(!(await teams(ev)).some((t) => [t.player_a_id, t.player_b_id].includes(aRow.id)), 'request_partner released the lone slot');
  // …and pair: with a platform user, or with a guest.
  assert((await rpc(a.jwt, 'choose_partner', { p_event_id: ev, p_partner_user: d.id })) === 'confirmed', 'choose_partner works');

  // Same for choose_guest_partner and accept_partner_request, from a fresh lone slot.
  const ev2 = await create(org, { specification: 'team', num_courts: 2, invitees: invitees(a, b, c) });
  for (const u of [a, b, c]) await rpc(u.jwt, 'request_partner', { p_event_id: ev2, p_targets: [] });
  const assign = async (u, slot) => rpc(org.jwt, 'organizer_assign_to_team', { p_event_id: ev2, p_participant_id: (await part(ev2, u)).id, p_team_number: 1, p_slot: slot });
  await assign(a, 'a'); await assign(b, 'b');
  await rpc(org.jwt, 'organizer_remove_from_team', { p_event_id: ev2, p_participant_id: (await part(ev2, a)).id });
  // b is alone now; c asks b, b accepts.
  await rpc(c.jwt, 'request_partner', { p_event_id: ev2, p_targets: [b.id] });
  const [req] = await sel('partner_requests', `event_id=eq.${ev2}&requester_id=eq.${c.id}&target_id=eq.${b.id}&select=id`);
  assert((await rpc(b.jwt, 'accept_partner_request', { p_request_id: req.id })) === 'confirmed', 'accept_partner_request works');
  // a (invited, no slot) pairs with a guest.
  assert((await rpc(a.jwt, 'choose_guest_partner', { p_event_id: ev2, p_name: 'Lone Guest' })) === 'confirmed', 'choose_guest_partner works');
  const full = (await teams(ev2)).filter((t) => t.player_a_id && t.player_b_id);
  assert(full.length === 2 && full.every((t) => t.is_confirmed), 'two confirmed full teams');
});

await run('a partner_request notification is settled with its request, however it ends', async () => {
  const [org, a, b, c, d, e] = [await user('prs-org'), await user('prs-a'), await user('prs-b'), await user('prs-c'), await user('prs-d'), await user('prs-e')];
  const ev = await create(org, { specification: 'team', num_courts: 2, invitees: invitees(a, b, c, d, e) });
  const note = async (to, from) =>
    (await sel('notifications', `user_id=eq.${to.id}&type=eq.partner_request&event_id=eq.${ev}&actor_id=eq.${from.id}&select=read_at,cta_done&order=created_at.desc`))[0];
  const settled = (n) => n && n.cta_done === true && n.read_at !== null;
  const reqId = async (from, to) =>
    (await sel('partner_requests', `event_id=eq.${ev}&requester_id=eq.${from.id}&target_id=eq.${to.id}&select=id`))[0].id;

  // a asks b, c and d. b accepts; the pair forming closes a→c and a→d by the system.
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id, c.id, d.id] });
  assert(!settled(await note(b, a)), 'open while pending');
  await rpc(b.jwt, 'accept_partner_request', { p_request_id: await reqId(a, b) });
  assert(settled(await note(b, a)), 'accepted → settled');
  assert(settled(await note(c, a)) && settled(await note(d, a)), 'closed by the system → settled');

  // Declined, and withdrawn.
  await rpc(c.jwt, 'request_partner', { p_event_id: ev, p_targets: [d.id, e.id] });
  await rpc(d.jwt, 'decline_partner_request', { p_request_id: await reqId(c, d) });
  assert(settled(await note(d, c)), 'declined → settled');
  await rpc(c.jwt, 'withdraw_partner_request', { p_request_id: await reqId(c, e) });
  // 0118: a withdrawn ask the target never read is deleted, not settled (no double notification).
  assert((await note(e, c)) === undefined, 'withdrawn → gone');

  // Leaving takes the leaver's pending asks with them.
  await rpc(d.jwt, 'request_partner', { p_event_id: ev, p_targets: [e.id] });
  await rpc(d.jwt, 'leave_event', { p_event_id: ev });
  assert((await note(e, d)) === undefined, 'requester left → gone (0118)');
});
