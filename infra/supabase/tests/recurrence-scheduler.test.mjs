// infra/supabase/tests/recurrence-scheduler.test.mjs
//
// Migration 0117 (UX Audit — Events, plan PR 7, decision 10 / B15): materialize_due_occurrences()
// opens a series' next occurrence invite_lead_days before it. The test never waits for pg_cron: it
// calls the function directly with the service key (it is revoked from anon and authenticated), and
// moves the series' latest occurrence in time with a service-role PATCH to make it due or not.
//
// The function sweeps EVERY active series on the stack, including other files' — so every assertion
// here is about this file's own series, never about the returned count alone.
import { user, rpc, anonRpc, sel, insert, patch, del, expectError, assert, run } from './lib.mjs';

const DAY = 864e5;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);

const base = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Weekly ${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: at(3 * DAY), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const series = (lead) => ({ day_of_week: 3, start_time: '19:00', duration_minutes: 90, invite_lead_days: lead });

/** Organizer + community on Pro + a public group with `members` in it. */
async function group(t, members) {
  const admin = await user(`${t}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Recurrence ${t} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const groupId = await rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Weekly', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });
  for (const u of members) {
    await insert('community_members', { community_id: communityId, user_id: u.id, role: 'member' });
    await rpc(u.jwt, 'join_group', { p_group_id: groupId, p_ack: true });
  }
  return { admin, groupId };
}

const sweep = () => rpc(null, 'materialize_due_occurrences');
const eventRow = (ev) =>
  sel('events', `id=eq.${ev}&select=id,series_id,starts_at,status,manual_court_names,num_courts,name`).then((r) => r[0]);
const occurrences = (seriesId) =>
  sel('events', `series_id=eq.${seriesId}&deleted_at=is.null&select=id,starts_at,status,manual_court_names&order=starts_at`);
const notifs = (u, type, ev) => sel('notifications', `user_id=eq.${u.id}&type=eq.${type}&event_id=eq.${ev}&select=id`);
/** Move an event's start (service role; update_event would refuse a past start). */
const moveTo = (ev, iso) => patch('events', `id=eq.${ev}`, { starts_at: iso });
const sameInstant = (a, b) => new Date(a).getTime() === new Date(b).getTime();

// Europe/Lisbon wall-clock helpers. Every source occurrence here is moved to 19:00 Lisbon, and 0117
// opens each next occurrence at the same Lisbon wall-clock time one week (k weeks) later.
const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const lisbonDate = (t) => fmtDate.format(new Date(t)); // 'YYYY-MM-DD'
const lisbonHM = (t) => fmtHM.format(new Date(t)); // 'HH:MM'
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (d1, d2) => Math.round((Date.parse(`${d2}T12:00:00Z`) - Date.parse(`${d1}T12:00:00Z`)) / DAY);
/** The instant that is 19:00 in Lisbon on local date `d` (Lisbon is UTC+0 or UTC+1). */
function lisbon1900(d) {
  for (const utcHour of ['19', '18']) {
    const t = Date.parse(`${d}T${utcHour}:00:00Z`);
    if (lisbonHM(t) === '19:00' && lisbonDate(t) === d) return t;
  }
  throw new Error(`no 19:00 in Lisbon on ${d}`);
}
/** The latest 19:00-Lisbon instant at least `ms` ago, as an ISO string. Makes due-ness independent
 *  of the time of day the suite runs at. */
function slotBefore(ms) {
  const limit = Date.now() - ms;
  const d = lisbonDate(limit);
  const t = lisbon1900(d) <= limit ? lisbon1900(d) : lisbon1900(addDays(d, -1));
  return new Date(t).toISOString();
}
const H = 36e5;

// ---------------------------------------------------------------------------------------------

await run('internal: materialize_due_occurrences and _materialize_next are closed to the API roles', async () => {
  const u = await user('rs-priv');
  const ZERO = '00000000-0000-0000-0000-000000000000';
  await expectError(() => rpc(u.jwt, 'materialize_due_occurrences'), 'permission denied for function');
  await expectError(() => anonRpc('materialize_due_occurrences'), 'permission denied for function');
  await expectError(() => rpc(u.jwt, '_materialize_next', { p_after_event_id: ZERO, p_actor: ZERO, p_target: null }),
    'permission denied for function');
  await expectError(() => anonRpc('_materialize_next', { p_after_event_id: ZERO, p_actor: ZERO, p_target: null }),
    'permission denied for function');
});

await run('a due public series materialises once, tells the group, and a second sweep does nothing', async () => {
  const [a, b] = [await user('rs-pub-a'), await user('rs-pub-b')];
  const { admin, groupId } = await group('rs-pub', [a, b]);
  const ev = await rpc(admin.jwt, 'create_event', {
    p_payload: base(groupId, { series: series(7), num_courts: 2, manual_court_names: ['Central', 'Court B'] }),
  });
  const src = await eventRow(ev);
  // Lead 7: the next slot (a week later, 19:00 Lisbon) is due as soon as the last one has started.
  const last = slotBefore(2 * H);
  await moveTo(ev, last);

  await sweep();
  const occ = await occurrences(src.series_id);
  assert(occ.length === 2, `one new occurrence, got ${occ.length - 1}`);
  const next = occ[1];
  assert(sameInstant(next.starts_at, new Date(lisbon1900(addDays(lisbonDate(last), 7))).toISOString()),
    'next = one week later, 19:00 Lisbon');
  assert(next.status === 'scheduled', 'scheduled');
  assert(JSON.stringify(next.manual_court_names) === '["Central","Court B"]', 'manual_court_names copied');
  assert((await sel('event_invitations', `event_id=eq.${next.id}&select=id`)).length === 0, 'public: no invitations');
  assert((await notifs(a, 'event_created', next.id)).length === 1, 'member a told (event_created)');
  assert((await notifs(b, 'event_created', next.id)).length === 1, 'member b told (event_created)');
  assert((await notifs(admin, 'event_created', next.id)).length === 0, 'organizer not notified');

  await sweep();
  assert((await occurrences(src.series_id)).length === 2, 'second sweep creates nothing');
  assert((await notifs(a, 'event_created', next.id)).length === 1, 'and notifies nobody again');

  // The organizer path lands on the same slot and returns it (idempotent across both callers).
  const tapped = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: ev });
  assert(tapped === next.id, 'materialize_occurrence returns the slot the scheduler opened');
});

await run('a series that is not yet due is left alone', async () => {
  const { admin, groupId } = await group('rs-early', []);
  // Lead 3, last occurrence in 3 days → next in 10 days, due in 7.
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(3) }) });
  const { series_id } = await eventRow(ev);
  await sweep();
  assert((await occurrences(series_id)).length === 1, 'nothing materialised');

  // Lead 5 with the last occurrence under a day ago: next in 6+ days, due in 1+.
  const ev5 = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(5) }) });
  await moveTo(ev5, slotBefore(1 * H));
  await sweep();
  assert((await occurrences((await eventRow(ev5)).series_id)).length === 1, 'lead 5, 6 days out: not yet');
  // …and over two days ago: next within 5 days, inside the lead.
  await moveTo(ev5, slotBefore(2 * DAY + 2 * H));
  await sweep();
  assert((await occurrences((await eventRow(ev5)).series_id)).length === 2, 'lead 5, 4 days out: due');
});

await run('inactive series, deleted series and archived groups are skipped', async () => {
  const { admin, groupId } = await group('rs-off', []);
  const mk = async () => {
    const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
    await moveTo(ev, slotBefore(2 * H));
    return (await eventRow(ev)).series_id;
  };
  const inactive = await mk();
  await patch('event_series', `id=eq.${inactive}`, { is_active: false });
  const deleted = await mk();
  await patch('event_series', `id=eq.${deleted}`, { deleted_at: new Date().toISOString() });
  await sweep();
  assert((await occurrences(inactive)).length === 1, 'inactive series skipped');
  assert((await occurrences(deleted)).length === 1, 'deleted series skipped');

  const other = await group('rs-arch', []);
  const ev = await rpc(other.admin.jwt, 'create_event', { p_payload: base(other.groupId, { series: series(7) }) });
  await moveTo(ev, slotBefore(2 * H));
  const { series_id } = await eventRow(ev);
  await patch('groups', `id=eq.${other.groupId}`, { archived_at: new Date().toISOString() });
  await sweep();
  assert((await occurrences(series_id)).length === 1, 'archived group skipped');
});

await run('a cancelled occurrence does not stop the series; a deleted one is never re-created', async () => {
  const { admin, groupId } = await group('rs-cancel', []);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
  await moveTo(ev, slotBefore(2 * H));
  await patch('events', `id=eq.${ev}`, { status: 'cancelled' });
  const { series_id } = await eventRow(ev);
  await sweep();
  const occ = await occurrences(series_id);
  assert(occ.length === 2 && occ[1].status === 'scheduled', 'next occurrence opened after a cancelled one');

  // Soft-delete that new occurrence. Were the last slot taken from live events only, the cancelled one
  // (hours ago) would make that same slot due again and the sweep would re-create it.
  const deletedSlot = occ[1].starts_at;
  await patch('events', `id=eq.${occ[1].id}`, { deleted_at: new Date().toISOString() });
  await sweep();
  const after = await occurrences(series_id);
  assert(after.length === 1, 'a deleted occurrence is not re-created while its slot is the latest');
  assert(!after.some((o) => sameInstant(o.starts_at, deletedSlot)), 'deleted slot stays deleted');
});

await run('a series that fell behind picks up at its next future slot, once', async () => {
  const { admin, groupId } = await group('rs-behind', []);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
  // Last occurrence 20-21 days ago → the slots a week and two weeks later are past; the third is not.
  const last = slotBefore(20 * DAY);
  await moveTo(ev, last);
  const { series_id } = await eventRow(ev);
  await sweep();
  await sweep();
  const occ = await occurrences(series_id);
  assert(occ.length === 2, `exactly one catch-up occurrence, got ${occ.length - 1}`);
  const gap = daysBetween(lisbonDate(last), lisbonDate(occ[1].starts_at));
  assert(new Date(occ[1].starts_at).getTime() > Date.now(), 'in the future');
  assert(gap >= 21 && gap % 7 === 0, `on the weekly grid (${gap} days after the last one)`);
  assert(lisbonHM(occ[1].starts_at) === '19:00', 'at the same Lisbon wall-clock time');
});

await run('a due private series copies its invitations as pending and sends event_invite', async () => {
  const [a, b, c, d, e] = [await user('rs-priv-a'), await user('rs-priv-b'), await user('rs-priv-c'),
    await user('rs-priv-d'), await user('rs-priv-e')];
  const { admin, groupId } = await group('rs-priv', [a, b, c]);
  const ev = await rpc(admin.jwt, 'create_event', {
    p_payload: base(groupId, { is_private: true, series: series(7),
      invitees: [a, b, d, e].map((u) => ({ invitee_id: u.id })) }),
  });
  await rpc(a.jwt, 'accept_event_invitation', { p_event_id: ev });
  // d declined last week; e has since deleted their account. Neither is invited again.
  await patch('event_invitations', `event_id=eq.${ev}&invitee_id=eq.${d.id}`, { status: 'declined' });
  await patch('profiles', `id=eq.${e.id}`, { deleted_at: new Date().toISOString() });
  await moveTo(ev, slotBefore(2 * H));
  const { series_id } = await eventRow(ev);
  await sweep();
  const occ = await occurrences(series_id);
  assert(occ.length === 2, 'occurrence opened');
  const next = occ[1].id;
  const inv = await sel('event_invitations', `event_id=eq.${next}&select=invitee_id,status,invited_by`);
  assert(inv.length === 2 && inv.every((i) => i.status === 'pending' && i.invited_by === admin.id),
    `a and b copied as pending, from the organizer (got ${inv.length})`);
  assert(!inv.some((i) => i.invitee_id === d.id), 'a declined invitation is not copied');
  assert(!inv.some((i) => i.invitee_id === e.id), 'a deleted account is not invited');
  assert((await notifs(a, 'event_invite', next)).length === 1, 'a gets event_invite (even after accepting last week)');
  assert((await notifs(b, 'event_invite', next)).length === 1, 'b gets event_invite');
  assert((await notifs(c, 'event_created', next)).length === 0, 'the rest of the group is not told');
  assert((await sel('event_participants', `event_id=eq.${next}&select=id`)).length === 0, 'participants are not copied');
});

await run('DST: a 19:00 Lisbon series stays 19:00 across the last Sundays of October and March', async () => {
  const { admin, groupId } = await group('rs-dst', []);
  const mk = async () => rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
  // Oct 2026: clocks go back on Sunday the 25th (WEST UTC+1 → WET UTC+0).
  const oct = await mk();
  await moveTo(oct, '2026-10-21T18:00:00Z'); // Wed 19:00 WEST
  const oct2 = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: oct });
  assert(sameInstant((await eventRow(oct2)).starts_at, '2026-10-28T19:00:00Z'), 'Wed 28 Oct at 19:00 WET (was 18:00 with +168 h)');
  const oct3 = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: oct2 });
  assert(sameInstant((await eventRow(oct3)).starts_at, '2026-11-04T19:00:00Z'), 'and stays 19:00 the week after');
  // Mar 2027: clocks go forward on Sunday the 28th (WET → WEST).
  const mar = await mk();
  await moveTo(mar, '2027-03-24T19:00:00Z'); // Wed 19:00 WET
  const mar2 = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: mar });
  assert(sameInstant((await eventRow(mar2)).starts_at, '2027-03-31T18:00:00Z'), 'Wed 31 Mar at 19:00 WEST (was 20:00 with +168 h)');
  assert(lisbonHM((await eventRow(mar2)).starts_at) === '19:00', 'Lisbon wall clock 19:00');
});

/** A registry venue with two courts (venues are service-role writes). */
async function venue(admin) {
  const [v] = await insert('venues', { name: `Venue ${tag()}`, address: 'Lisbon', created_by: admin.id });
  const cs = await insert('courts', [{ venue_id: v.id, name: 'C1', sort_order: 1 }, { venue_id: v.id, name: 'C2', sort_order: 2 }]);
  return { id: v.id, courts: cs.map((c) => c.id) };
}
const atVenue = (v) => ({ venue_id: v.id, manual_location_name: null, manual_location_address: null, num_courts: 2, court_ids: v.courts });
const courtIds = (ev) => sel('event_courts', `event_id=eq.${ev}&select=court_id`).then((r) => r.map((c) => c.court_id).sort());

await run('registry venue: event_courts carry over to the occurrence and to a duplicate (public group copy)', async () => {
  const [a] = [await user('rs-ven-a')];
  const { admin, groupId } = await group('rs-ven', [a]);
  const v = await venue(admin);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7), ...atVenue(v) }) });
  await moveTo(ev, slotBefore(2 * H));
  const { series_id } = await eventRow(ev);
  await sweep();
  const occ = await occurrences(series_id);
  assert(occ.length === 2, 'occurrence opened');
  assert(JSON.stringify(await courtIds(occ[1].id)) === JSON.stringify([...v.courts].sort()), 'occurrence has the same courts');

  const dup = await rpc(admin.jwt, 'duplicate_event', { p_event_id: occ[1].id, p_overrides: { starts_at: at(20 * DAY) } });
  const dupRow = (await sel('events', `id=eq.${dup}&select=series_id,venue_id`))[0];
  assert(dupRow.series_id === null, 'a duplicate is a one-off (series_id null)');
  assert(dupRow.venue_id === v.id, 'same venue');
  assert(JSON.stringify(await courtIds(dup)) === JSON.stringify([...v.courts].sort()), 'duplicate has the same courts');
  assert((await sel('event_invitations', `event_id=eq.${dup}&select=id`)).length === 0, 'public copy: no invitations');
  assert((await notifs(a, 'event_created', dup)).length === 1, 'public copy: the group is told');
  // The duplicate does not re-anchor the series.
  assert((await occurrences(series_id)).length === 2, 'the series is unchanged by the duplicate');
});

await run('a soft-deleted venue: the sweep skips the series, the organizer paths raise venue_not_found', async () => {
  const { admin, groupId } = await group('rs-vdel', []);
  const v = await venue(admin);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7), ...atVenue(v) }) });
  await moveTo(ev, slotBefore(2 * H));
  const { series_id } = await eventRow(ev);
  await patch('venues', `id=eq.${v.id}`, { deleted_at: new Date().toISOString() });
  await sweep();
  assert((await occurrences(series_id)).length === 1, 'skipped (a WARNING is logged)');
  await expectError(() => rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: ev }), 'venue_not_found');
  await expectError(() => rpc(admin.jwt, 'duplicate_event', { p_event_id: ev, p_overrides: { starts_at: at(10 * DAY) } }), 'venue_not_found');
});

await run('an organizer who left the group, or deleted their account, no longer runs the series', async () => {
  const { admin, groupId } = await group('rs-left', []);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
  await moveTo(ev, slotBefore(2 * H));
  const { series_id } = await eventRow(ev);
  await del('group_members', `group_id=eq.${groupId}&user_id=eq.${admin.id}`);
  await sweep();
  assert((await occurrences(series_id)).length === 1, 'removed organizer: skipped');
  await expectError(() => rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: ev }), 'forbidden');

  const other = await group('rs-gone', []);
  const ev2 = await rpc(other.admin.jwt, 'create_event', { p_payload: base(other.groupId, { series: series(7) }) });
  await moveTo(ev2, slotBefore(2 * H));
  const s2 = (await eventRow(ev2)).series_id;
  await patch('profiles', `id=eq.${other.admin.id}`, { deleted_at: new Date().toISOString() });
  await sweep();
  assert((await occurrences(s2)).length === 1, 'deleted organizer: skipped');
});

await run('duplicate_event copies manual_court_names', async () => {
  const org = await user('rs-dup');
  const ev = await rpc(org.jwt, 'create_event', {
    p_payload: base(null, { is_private: true, num_courts: 2, manual_court_names: ['North', 'South'] }),
  });
  const dup = await rpc(org.jwt, 'duplicate_event', { p_event_id: ev, p_overrides: { starts_at: at(10 * DAY) } });
  assert(JSON.stringify((await eventRow(dup)).manual_court_names) === '["North","South"]', 'copied');
});
