// infra/supabase/tests/recurrence-occurrences.test.mjs
//
// Migration 0123 (UX Audit — Manage Event, plan D5, UX-MEVT-08/21/22): the weekly grid
// (event_series.grid_anchor + events.slot_at), event_series_exceptions, event_next_occurrences,
// update_occurrence_slot / cancel_occurrence_slot / send_occurrence_now, update_event's scope,
// set_event_recurrence, and the scheduler honouring exceptions.
//
// materialize_due_occurrences() sweeps every active series on the stack, so every assertion is
// about this file's own series. The scheduler is called with the service key, as in
// recurrence-scheduler.test.mjs.
import { user, rpc, anonRpc, req, sel, insert, patch, expectError, assert, run } from './lib.mjs';

const DAY = 864e5;
const H = 36e5;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);
const ZERO = '00000000-0000-0000-0000-000000000000';

const base = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Weekly ${tag()}`, venue_id: null,
  manual_location_name: 'Court A', manual_location_address: 'Street A', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: at(3 * DAY), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const series = (lead) => ({ day_of_week: 3, start_time: '19:00', duration_minutes: 90, invite_lead_days: lead });

/** Organizer + community on `plan` (Pro by default) + a public group with `members`. */
async function group(t, members, { plan = 'community_pro' } = {}) {
  const admin = await user(`${t}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Occurrences ${t} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: plan, status: 'active', provider: 'manual' });
  const groupId = await rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Weekly', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });
  for (const u of members) {
    await insert('community_members', { community_id: communityId, user_id: u.id, role: 'member' });
    await rpc(u.jwt, 'join_group', { p_group_id: groupId, p_ack: true });
  }
  return { admin, groupId };
}

// ----- Europe/Lisbon wall-clock helpers (as recurrence-scheduler.test.mjs) -----
const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const lisbonDate = (t) => fmtDate.format(new Date(t));
const lisbonHM = (t) => fmtHM.format(new Date(t));
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** The instant that is HH:MM in Lisbon on local date `d`. */
function lisbonAt(d, hm = '19:00') {
  const [h, m] = hm.split(':').map(Number);
  for (const off of [0, 1]) {
    const t = Date.parse(`${d}T00:00:00Z`) + ((h - off) * 60 + m) * 60e3;
    if (lisbonHM(t) === hm && lisbonDate(t) === d) return new Date(t).toISOString();
  }
  throw new Error(`no ${hm} in Lisbon on ${d}`);
}
/** 19:00 Lisbon, `days` days from today. */
const at19 = (days) => lisbonAt(addDays(lisbonDate(Date.now()), days));
/** The latest 19:00-Lisbon instant at least `ms` ago. */
function slotBefore(ms) {
  const limit = Date.now() - ms;
  const d = lisbonDate(limit);
  const t = Date.parse(lisbonAt(d)) <= limit ? lisbonAt(d) : lisbonAt(addDays(d, -1));
  return t;
}
const sameInstant = (a, b) => new Date(a).getTime() === new Date(b).getTime();

const sweep = () => rpc(null, 'materialize_due_occurrences');
const eventRow = (ev) =>
  sel('events', `id=eq.${ev}&select=id,series_id,starts_at,slot_at,status,name,manual_location_name,duration_minutes`).then((r) => r[0]);
const seriesRow = (id) => sel('event_series', `id=eq.${id}&select=*`).then((r) => r[0]);
const occurrences = (seriesId) =>
  sel('events', `series_id=eq.${seriesId}&deleted_at=is.null&select=id,starts_at,slot_at,status,name&order=starts_at`);
const exceptions = (seriesId) => sel('event_series_exceptions', `series_id=eq.${seriesId}&select=*&order=slot_date`);
const notifs = (u, type, ev) => sel('notifications', `user_id=eq.${u.id}&type=eq.${type}&event_id=eq.${ev}&select=id`);
const activity = (ev, action) => sel('event_activity', `event_id=eq.${ev}&action=eq.${action}&select=id,detail`);
const next = (jwt, ev, limit = 4) => rpc(jwt, 'event_next_occurrences', { p_event_id: ev, p_limit: limit });
/** Re-anchor a series on its first (only) event at `iso` (service role, as the scheduler test). */
async function anchorAt(ev, iso) {
  await patch('events', `id=eq.${ev}`, { starts_at: iso });
  const { series_id: seriesId } = await eventRow(ev);
  await patch('event_series', `id=eq.${seriesId}`, { grid_anchor: iso });
  return seriesId;
}
/** update_event's full payload for an existing event, with overrides. */
async function editPayload(ev, over = {}) {
  const [e] = await sel('events', `id=eq.${ev}&select=*`);
  return {
    name: e.name, description: e.description, thumbnail_path: e.thumbnail_path, starts_at: e.starts_at,
    duration_minutes: e.duration_minutes, scoring_mode: e.scoring_mode, scoring_value: e.scoring_value,
    allow_standby: e.allow_standby, standby_spots: e.standby_spots, is_private: e.is_private,
    entrance_fee_enabled: e.entrance_fee_enabled, entrance_fee_amount: e.entrance_fee_amount,
    entrance_fee_method: e.entrance_fee_method, entrance_fee_mba_number: e.entrance_fee_mba_number,
    players_submit_results: e.players_submit_results, venue_id: e.venue_id,
    manual_location_name: e.manual_location_name, manual_location_address: e.manual_location_address,
    has_location: e.has_location, num_courts: e.num_courts, ...over,
  };
}

// ---------------------------------------------------------------------------------------------

await run('privileges: the helpers are internal, the RPCs need a session, exceptions are RPC-only', async () => {
  const u = await user('ro-priv');
  const DENIED = 'permission denied for function';
  for (const [name, args] of [
    ['_update_event_row', { p_event_id: ZERO, p_payload: {}, p_keep_slot: true }],
    ['_series_resolve_slot', { p_series_id: ZERO, p_slot_date: '2030-01-01' }],
    ['_series_organizer_guard', { p_series_id: ZERO }],
    ['_series_template', { p_series_id: ZERO }],
    ['_series_anchor', { p_series_id: ZERO }],
    ['_series_slot_on', { p_anchor: '2030-01-01T19:00:00Z', p_date: '2030-01-08' }],
    ['_series_next_slot', { p_anchor: '2030-01-01T19:00:00Z', p_after: '2030-01-02T00:00:00Z' }],
    ['_lisbon_date', { p_at: '2030-01-01T19:00:00Z' }],
  ]) {
    await expectError(() => rpc(u.jwt, name, args), DENIED);
  }
  for (const [name, args] of [
    ['event_next_occurrences', { p_event_id: ZERO, p_limit: 4 }],
    ['update_occurrence_slot', { p_series_id: ZERO, p_slot_date: '2030-01-01', p_starts_at: '2030-01-01T19:00:00Z' }],
    ['cancel_occurrence_slot', { p_series_id: ZERO, p_slot_date: '2030-01-01' }],
    ['send_occurrence_now', { p_series_id: ZERO, p_slot_date: '2030-01-01' }],
    ['set_event_recurrence', { p_event_id: ZERO, p_on: true }],
    ['update_event', { p_event_id: ZERO, p_payload: {}, p_scope: 'only_this' }],
  ]) {
    await expectError(() => anonRpc(name, args), DENIED);
  }

  const member = await user('ro-priv-m');
  const { admin, groupId } = await group('ro-priv', [member]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(3) }) });
  const { series_id: seriesId } = await eventRow(ev);
  const slot = lisbonDate((await next(admin.jwt, ev))[0].starts_at);
  await rpc(admin.jwt, 'cancel_occurrence_slot', { p_series_id: seriesId, p_slot_date: slot });
  // RLS: the organizer reads the exceptions; a group member does not; nobody writes them.
  const asUser = (jwt, path, method = 'GET', body) => req(path, { method, jwt, body });
  assert((await asUser(admin.jwt, `/rest/v1/event_series_exceptions?series_id=eq.${seriesId}&select=slot_date`)).length === 1,
    'organizer reads the exception');
  assert((await asUser(member.jwt, `/rest/v1/event_series_exceptions?series_id=eq.${seriesId}&select=slot_date`)).length === 0,
    'a member does not');
  await expectError(() => asUser(admin.jwt, '/rest/v1/event_series_exceptions', 'POST',
    { series_id: seriesId, slot_date: addDays(slot, 7), cancelled: true }), 'permission denied');
  await expectError(() => asUser(admin.jwt, `/rest/v1/event_series_exceptions?series_id=eq.${seriesId}`, 'DELETE'), 'permission denied');
  // Organizer only.
  await expectError(() => next(member.jwt, ev), 'forbidden');
  await expectError(() => rpc(member.jwt, 'send_occurrence_now', { p_series_id: seriesId, p_slot_date: slot }), 'forbidden');
  await expectError(() => rpc(member.jwt, 'set_event_recurrence', { p_event_id: ev, p_on: false }), 'forbidden');
});

await run('event_next_occurrences: the next weekly slots after this one, Upcoming vs Scheduled', async () => {
  const { admin, groupId } = await group('ro-list', []);
  const first = at19(3);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(3), starts_at: first }) });
  const { series_id: seriesId } = await eventRow(ev);
  assert(sameInstant((await seriesRow(seriesId)).grid_anchor, first), 'the first event anchors the grid');

  let list = await next(admin.jwt, ev);
  assert(list.length === 4, `4 occurrences, got ${list.length}`);
  list.forEach((o, i) => {
    assert(o.status === 'upcoming' && o.event_id === null, `#${i} upcoming`);
    assert(sameInstant(o.starts_at, at19(3 + 7 * (i + 1))), `#${i} one week apart at 19:00 Lisbon`);
    assert(o.slot_date === lisbonDate(o.starts_at), `#${i} slot_date is the Lisbon date`);
    assert(o.location_name === 'Court A' && o.location_address === 'Street A', `#${i} template location`);
    assert(o.duration_minutes === 90 && o.overridden === false, `#${i} duration, not overridden`);
  });
  assert((await next(admin.jwt, ev, 2)).length === 2, 'p_limit');

  // Materialising the first one makes it Scheduled, with its event id.
  const occ = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: ev });
  list = await next(admin.jwt, ev);
  assert(list[0].status === 'scheduled' && list[0].event_id === occ, 'the first is Scheduled');
  assert(list.slice(1).every((o) => o.status === 'upcoming'), 'the rest are Upcoming');
  // From the materialised occurrence, the list starts after IT.
  const fromOcc = await next(admin.jwt, occ);
  assert(sameInstant(fromOcc[0].starts_at, at19(17)) && fromOcc[0].status === 'upcoming', 'after the occurrence itself');

  // A one-off event has no occurrences.
  const oneOff = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId) });
  assert((await next(admin.jwt, oneOff)).length === 0, 'one-off: empty');
});

await run('update_occurrence_slot / send_occurrence_now: an override moves the occurrence, not the series', async () => {
  const [p] = [await user('ro-ovr-p')];
  const { admin, groupId } = await group('ro-ovr', [p]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(3), starts_at: at19(3) }) });
  const { series_id: seriesId } = await eventRow(ev);
  const [s1, s2, s3] = (await next(admin.jwt, ev)).map((o) => o.slot_date);

  // Slot 2 moves to the day after, 20:30.
  const moved = lisbonAt(addDays(s2, 1), '20:30');
  await rpc(admin.jwt, 'update_occurrence_slot', { p_series_id: seriesId, p_slot_date: s2, p_starts_at: moved });
  let list = await next(admin.jwt, ev);
  assert(list[1].slot_date === s2 && sameInstant(list[1].starts_at, moved) && list[1].overridden, 'slot 2 overridden');
  assert(list[2].slot_date === s3 && sameInstant(list[2].starts_at, lisbonAt(s3)), 'slot 3 untouched');

  // Refusals.
  await expectError(() => rpc(admin.jwt, 'update_occurrence_slot', { p_series_id: seriesId, p_slot_date: s2, p_starts_at: at(-H) }), 'starts_at_in_past');
  await expectError(() => rpc(admin.jwt, 'update_occurrence_slot', { p_series_id: seriesId, p_slot_date: addDays(s2, 1), p_starts_at: moved }), 'occurrence_not_found');
  await expectError(() => rpc(admin.jwt, 'send_occurrence_now', { p_series_id: seriesId, p_slot_date: addDays(s1, -14) }), 'occurrence_not_found');
  // The anchor's own date is its (Scheduled) event.
  assert((await rpc(admin.jwt, 'send_occurrence_now', { p_series_id: seriesId, p_slot_date: addDays(s1, -7) })) === ev, 'the anchor date is the first event');

  // Send slot 2 now: it opens at the overridden time, remembering its slot; slot 1 stays Upcoming.
  const occ2 = await rpc(admin.jwt, 'send_occurrence_now', { p_series_id: seriesId, p_slot_date: s2 });
  const row = await eventRow(occ2);
  assert(sameInstant(row.starts_at, moved), 'starts at the override');
  assert(sameInstant(row.slot_at, lisbonAt(s2)), 'slot_at = the nominal slot');
  assert((await notifs(p, 'event_created', occ2)).length === 1, 'the group is told (invitations out)');
  assert((await rpc(admin.jwt, 'send_occurrence_now', { p_series_id: seriesId, p_slot_date: s2 })) === occ2, 'idempotent');
  list = await next(admin.jwt, ev);
  assert(list[0].slot_date === s1 && list[0].status === 'upcoming', 'slot 1 still Upcoming');
  assert(list[1].status === 'scheduled' && list[1].event_id === occ2, 'slot 2 Scheduled');
  await expectError(() => rpc(admin.jwt, 'update_occurrence_slot', { p_series_id: seriesId, p_slot_date: s2, p_starts_at: at(9 * DAY) }), 'occurrence_materialised');
  // The grid did not move: slot 1 still opens on its own date, and the anchor is unchanged.
  assert(sameInstant((await seriesRow(seriesId)).grid_anchor, at19(3)), 'grid anchor unchanged');
  const occ1 = await rpc(admin.jwt, 'send_occurrence_now', { p_series_id: seriesId, p_slot_date: s1 });
  assert(sameInstant((await eventRow(occ1)).starts_at, lisbonAt(s1)) && (await eventRow(occ1)).slot_at === null, 'slot 1 at its slot');

  // Setting a slot back to its own time drops the override.
  await rpc(admin.jwt, 'update_occurrence_slot', { p_series_id: seriesId, p_slot_date: s3, p_starts_at: lisbonAt(s3, '21:00') });
  assert((await exceptions(seriesId)).some((x) => x.slot_date === s3), 'override stored');
  await rpc(admin.jwt, 'update_occurrence_slot', { p_series_id: seriesId, p_slot_date: s3, p_starts_at: lisbonAt(s3) });
  assert(!(await exceptions(seriesId)).some((x) => x.slot_date === s3), 'override dropped');
});

await run('the scheduler honours exceptions: cancelled slots skipped, lead counted from the override', async () => {
  const { admin, groupId } = await group('ro-sweep', []);
  // Lead 7, anchor ~2 h ago: slot 1 (~7 days out) is due.
  const evA = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
  const sA = await anchorAt(evA, slotBefore(2 * H));
  const [a1] = (await next(admin.jwt, evA)).map((o) => o.slot_date);
  await rpc(admin.jwt, 'cancel_occurrence_slot', { p_series_id: sA, p_slot_date: a1 });
  await sweep();
  assert((await occurrences(sA)).length === 1, 'a cancelled slot is not materialised');
  assert((await next(admin.jwt, evA))[0].slot_date === addDays(a1, 7), 'nor listed');
  await expectError(() => rpc(admin.jwt, 'send_occurrence_now', { p_series_id: sA, p_slot_date: a1 }), 'occurrence_cancelled');
  // The organizer tap skips it too and opens the week after.
  const tap = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: evA });
  assert(lisbonDate((await eventRow(tap)).starts_at) === addDays(a1, 7), 'materialize_occurrence skips a cancelled slot');

  // Lead 7, slot 1 due — but moved 3 days later it is outside the lead: nothing yet.
  const evB = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
  const sB = await anchorAt(evB, slotBefore(2 * H));
  const [b1] = (await next(admin.jwt, evB)).map((o) => o.slot_date);
  await rpc(admin.jwt, 'update_occurrence_slot', { p_series_id: sB, p_slot_date: b1, p_starts_at: lisbonAt(addDays(b1, 3)) });
  await sweep();
  assert((await occurrences(sB)).length === 1, 'override later than the lead: not due');

  // Lead 3, slot 1 ~7 days out (not due) — moved to 2 days from now it is due, and opens there.
  const evC = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(3) }) });
  const sC = await anchorAt(evC, slotBefore(2 * H));
  const [c1] = (await next(admin.jwt, evC)).map((o) => o.slot_date);
  await sweep();
  assert((await occurrences(sC)).length === 1, 'lead 3, a week out: not due');
  const early = at19(2);
  await rpc(admin.jwt, 'update_occurrence_slot', { p_series_id: sC, p_slot_date: c1, p_starts_at: early });
  await sweep();
  const occ = await occurrences(sC);
  assert(occ.length === 2, 'override inside the lead: materialised');
  assert(sameInstant(occ[1].starts_at, early) && sameInstant(occ[1].slot_at, lisbonAt(c1)), 'at the override, on its slot');
  await sweep();
  assert((await occurrences(sC)).length === 2, 'and only once');
});

await run('cancel_occurrence_slot on a Scheduled occurrence cancels that event only', async () => {
  const [p] = [await user('ro-cx-p')];
  const { admin, groupId } = await group('ro-cx', [p]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(3), starts_at: at19(3) }) });
  const { series_id: seriesId } = await eventRow(ev);
  const occ = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: ev });
  await rpc(p.jwt, 'join_event', { p_event_id: occ });
  const slot = lisbonDate((await eventRow(occ)).starts_at);
  await rpc(admin.jwt, 'cancel_occurrence_slot', { p_series_id: seriesId, p_slot_date: slot });
  assert((await eventRow(occ)).status === 'cancelled', 'occurrence cancelled');
  assert((await notifs(p, 'event_cancelled', occ)).length === 1, 'its player told');
  assert((await seriesRow(seriesId)).is_active, 'the series goes on');
  const list = await next(admin.jwt, ev);
  assert(list[0].slot_date === addDays(slot, 7) && list[0].status === 'upcoming', 'the cancelled one is not listed');
  await expectError(() => rpc(admin.jwt, 'send_occurrence_now', { p_series_id: seriesId, p_slot_date: slot }), 'occurrence_cancelled');
});

await run("update_event 'only_this' on an occurrence keeps the series on its grid", async () => {
  const { admin, groupId } = await group('ro-only', []);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(3), starts_at: at19(3) }) });
  const { series_id: seriesId } = await eventRow(ev);
  const moved = lisbonAt(addDays(lisbonDate(at19(3)), 1), '20:00');
  await rpc(admin.jwt, 'update_event', { p_event_id: ev, p_payload: await editPayload(ev, { starts_at: moved }) });
  const row = await eventRow(ev);
  assert(sameInstant(row.starts_at, moved) && sameInstant(row.slot_at, at19(3)), 'moved; slot kept');
  assert(sameInstant((await seriesRow(seriesId)).grid_anchor, at19(3)), 'anchor unchanged');
  const list = await next(admin.jwt, ev);
  assert(sameInstant(list[0].starts_at, at19(10)), 'the next slot is still a week after the original slot');
  // Moving it back to the slot clears slot_at.
  await rpc(admin.jwt, 'update_event', { p_event_id: ev, p_payload: await editPayload(ev, { starts_at: at19(3) }), p_scope: 'only_this' });
  assert((await eventRow(ev)).slot_at === null, 'back on its slot');
  await expectError(async () => rpc(admin.jwt, 'update_event', { p_event_id: ev, p_payload: await editPayload(ev), p_scope: 'everything' }), 'invalid_scope');
});

await run("update_event 'this_and_upcoming' without a date change: later occurrences and the template follow", async () => {
  const [p] = [await user('ro-tu-p')];
  const { admin, groupId } = await group('ro-tu', [p]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(3), starts_at: at19(3) }) });
  const { series_id: seriesId } = await eventRow(ev);
  const occ = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: ev });
  await rpc(p.jwt, 'join_event', { p_event_id: occ });

  await rpc(admin.jwt, 'update_event', {
    p_event_id: ev, p_scope: 'this_and_upcoming',
    p_payload: await editPayload(ev, { name: 'Renamed weekly', manual_location_name: 'Court B', manual_location_address: 'Street B', duration_minutes: 120 }),
  });
  const [e0, e1] = [await eventRow(ev), await eventRow(occ)];
  assert(e0.name === 'Renamed weekly' && e1.name === 'Renamed weekly', 'both renamed');
  assert(e1.manual_location_name === 'Court B' && e1.duration_minutes === 120, 'later occurrence: location + duration');
  assert(sameInstant(e1.starts_at, at19(10)), 'later occurrence keeps its date');
  assert((await notifs(p, 'event_updated', occ)).length === 1, 'its confirmed player is told (location changed)');
  assert((await activity(occ, 'event_edited')).length === 1, 'activity on the later occurrence');
  assert((await seriesRow(seriesId)).duration_minutes === 120, 'series duration');
  const list = await next(admin.jwt, ev);
  const up = list.find((o) => o.status === 'upcoming');
  assert(up.location_name === 'Court B' && up.name === 'Renamed weekly' && up.duration_minutes === 120, 'upcoming slots show the new template');
  const sent = await rpc(admin.jwt, 'send_occurrence_now', { p_series_id: seriesId, p_slot_date: up.slot_date });
  const sentRow = await eventRow(sent);
  assert(sentRow.name === 'Renamed weekly' && sentRow.manual_location_name === 'Court B', 'a new materialisation inherits it');
});

await run("update_event 'this_and_upcoming' with a new day and time re-plans the series", async () => {
  const [p] = [await user('ro-rp-p')];
  const { admin, groupId } = await group('ro-rp', [p]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(3), starts_at: at19(3) }) });
  const { series_id: seriesId } = await eventRow(ev);
  const occ = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: ev }); // week 1
  await rpc(p.jwt, 'join_event', { p_event_id: occ });
  const d0 = lisbonDate(at19(3));
  // Week 2: an override (dropped by the re-plan); week 3: cancelled (moves with the grid).
  await rpc(admin.jwt, 'update_occurrence_slot', { p_series_id: seriesId, p_slot_date: addDays(d0, 14), p_starts_at: lisbonAt(addDays(d0, 15), '08:00') });
  await rpc(admin.jwt, 'cancel_occurrence_slot', { p_series_id: seriesId, p_slot_date: addDays(d0, 21) });

  const s1 = lisbonAt(addDays(d0, 1), '20:30');
  await rpc(admin.jwt, 'update_event', { p_event_id: ev, p_scope: 'this_and_upcoming', p_payload: await editPayload(ev, { starts_at: s1 }) });
  assert(sameInstant((await eventRow(ev)).starts_at, s1) && (await eventRow(ev)).slot_at === null, 'this event moved, on the new grid');
  const moved = await eventRow(occ);
  assert(sameInstant(moved.starts_at, lisbonAt(addDays(d0, 8), '20:30')) && moved.slot_at === null, 'week 1 moved one day later, 20:30');
  assert((await notifs(p, 'event_updated', occ)).length === 1, "week 1's confirmed player is told");
  const s = await seriesRow(seriesId);
  assert(sameInstant(s.grid_anchor, s1), 'grid re-anchored');
  assert(s.start_time.startsWith('20:30') && s.day_of_week === Number(new Date(`${addDays(d0, 1)}T12:00:00Z`).getUTCDay() || 7), 'weekday/time updated');
  const ex = await exceptions(seriesId);
  assert(ex.length === 1 && ex[0].slot_date === addDays(d0, 22) && ex[0].cancelled, 'cancelled week moved; override dropped');
  const list = await next(admin.jwt, ev, 3);
  assert(list[0].event_id === occ && list[0].status === 'scheduled', 'week 1 Scheduled');
  assert(list[1].status === 'upcoming' && sameInstant(list[1].starts_at, lisbonAt(addDays(d0, 15), '20:30')), 'week 2 on the new grid, no override');
  assert(list[2].slot_date === addDays(d0, 29), 'week 3 (cancelled) skipped');
});

await run('set_event_recurrence: off cancels the later occurrences and stops the series; on starts a new one', async () => {
  const [p] = [await user('ro-rec-p')];
  const { admin, groupId } = await group('ro-rec', [p]);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(5), starts_at: at19(3) }) });
  const { series_id: seriesId } = await eventRow(ev);
  const occ = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: ev });
  await rpc(p.jwt, 'join_event', { p_event_id: occ });
  await rpc(admin.jwt, 'cancel_occurrence_slot', { p_series_id: seriesId, p_slot_date: addDays(lisbonDate(at19(3)), 21) });

  await rpc(admin.jwt, 'set_event_recurrence', { p_event_id: ev, p_on: false });
  assert((await eventRow(occ)).status === 'cancelled', 'later occurrence cancelled');
  assert((await notifs(p, 'event_cancelled', occ)).length === 1, 'its player told');
  assert((await eventRow(ev)).status === 'scheduled', 'this event stays');
  const s = await seriesRow(seriesId);
  assert(s.is_active === false && s.deleted_at === null, 'series inactive (not deleted)');
  assert((await exceptions(seriesId)).length === 0, 'later exceptions gone');
  assert((await activity(ev, 'recurrence_off')).length === 1, 'recurrence_off logged');
  assert((await next(admin.jwt, ev)).length === 0, 'no next occurrences');
  await expectError(() => rpc(admin.jwt, 'send_occurrence_now', { p_series_id: seriesId, p_slot_date: addDays(lisbonDate(at19(3)), 14) }), 'series_inactive');
  await rpc(admin.jwt, 'set_event_recurrence', { p_event_id: ev, p_on: false }); // no-op

  await rpc(admin.jwt, 'set_event_recurrence', { p_event_id: ev, p_on: true });
  const again = await eventRow(ev);
  assert(again.series_id && again.series_id !== seriesId, 'a new series');
  const ns = await seriesRow(again.series_id);
  assert(ns.is_active && ns.invite_lead_days === 5 && sameInstant(ns.grid_anchor, at19(3)), 'active, old lead, anchored here');
  assert(ns.day_of_week === (new Date(`${lisbonDate(at19(3))}T12:00:00Z`).getUTCDay() || 7) && ns.start_time.startsWith('19:00'), 'weekday/time');
  assert((await activity(ev, 'recurrence_on')).length === 1, 'recurrence_on logged');
  const list = await next(admin.jwt, ev);
  assert(list.length === 4 && list[0].status === 'upcoming' && sameInstant(list[0].starts_at, at19(10)),
    'weekly again from this event (the cancelled week is not a gap)');
  await rpc(admin.jwt, 'set_event_recurrence', { p_event_id: ev, p_on: true }); // no-op
  assert((await eventRow(ev)).series_id === again.series_id, 'on again is a no-op');

  const org = await user('ro-rec-solo');
  const solo = await rpc(org.jwt, 'create_event', { p_payload: base(null, { is_private: true }) });
  await expectError(() => rpc(org.jwt, 'set_event_recurrence', { p_event_id: solo, p_on: true }), 'series_requires_group');
  await expectError(() => rpc(admin.jwt, 'set_event_recurrence', { p_event_id: ev, p_on: false, p_invite_lead_days: 4 }).then(() =>
    rpc(admin.jwt, 'set_event_recurrence', { p_event_id: ev, p_on: true, p_invite_lead_days: 4 })), 'invalid_event_config');
});

await run('set_event_recurrence on: the recurring_events plan cap applies', async () => {
  // Basic: recurring_events = 5.
  const { admin, groupId } = await group('ro-cap', [], { plan: 'basic' });
  const weekly = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
  for (let i = 0; i < 4; i++) await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
  const single = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId) });
  await expectError(() => rpc(admin.jwt, 'set_event_recurrence', { p_event_id: single, p_on: true }), 'recurring_events');
  assert((await eventRow(single)).series_id === null, 'nothing created');
  await rpc(admin.jwt, 'set_event_recurrence', { p_event_id: weekly, p_on: false });
  await rpc(admin.jwt, 'set_event_recurrence', { p_event_id: single, p_on: true });
  assert((await eventRow(single)).series_id !== null, 'allowed once the other series is off');
});

await run("cancel_event 'this_and_upcoming' ends the series: no Upcoming slot is left", async () => {
  const { admin, groupId } = await group('ro-cancel', []);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(3), starts_at: at19(3) }) });
  const { series_id: seriesId } = await eventRow(ev);
  const occ = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: ev });
  // The occurrence moved earlier than its slot (only_this) is still "upcoming" for the cancel.
  await rpc(admin.jwt, 'update_event', { p_event_id: occ, p_payload: await editPayload(occ, { starts_at: at19(9) }) });
  await rpc(admin.jwt, 'cancel_occurrence_slot', { p_series_id: seriesId, p_slot_date: addDays(lisbonDate(at19(3)), 21) });
  await rpc(admin.jwt, 'cancel_event', { p_event_id: ev, p_scope: 'this_and_upcoming' });
  assert((await eventRow(occ)).status === 'cancelled', 'the later occurrence is cancelled');
  const s = await seriesRow(seriesId);
  assert(!s.is_active && s.deleted_at, 'series inactive and deleted');
  assert((await exceptions(seriesId)).length === 0, 'exceptions gone');
  assert((await next(admin.jwt, ev)).length === 0, 'nothing listed');
  await expectError(() => rpc(admin.jwt, 'send_occurrence_now', { p_series_id: seriesId, p_slot_date: addDays(lisbonDate(at19(3)), 14) }), 'series_inactive');
  await sweep();
  assert((await occurrences(seriesId)).length === 2, 'the scheduler opens nothing');
});
