// infra/supabase/tests/recurrence-scheduler.test.mjs
//
// Migration 0117 (UX Audit — Events, plan PR 7, decision 10 / B15): materialize_due_occurrences()
// opens a series' next occurrence invite_lead_days before it. The test never waits for pg_cron: it
// calls the function directly with the service key (it is revoked from anon and authenticated), and
// moves the series' latest occurrence in time with a service-role PATCH to make it due or not.
//
// The function sweeps EVERY active series on the stack, including other files' — so every assertion
// here is about this file's own series, never about the returned count alone.
import { user, rpc, anonRpc, sel, insert, patch, expectError, assert, run } from './lib.mjs';

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
  // Lead 7: the next slot (last + 7 days) is due as soon as the last one has started.
  const last = at(-2 * 36e5);
  await moveTo(ev, last);

  await sweep();
  const occ = await occurrences(src.series_id);
  assert(occ.length === 2, `one new occurrence, got ${occ.length - 1}`);
  const next = occ[1];
  assert(sameInstant(next.starts_at, new Date(new Date(last).getTime() + 7 * DAY).toISOString()), 'next = last + 7 days');
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

  // Lead 5 with the last occurrence 1 day ago: next in 6 days, due tomorrow.
  const ev5 = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(5) }) });
  await moveTo(ev5, at(-1 * DAY));
  await sweep();
  assert((await occurrences((await eventRow(ev5)).series_id)).length === 1, 'lead 5, 6 days out: not yet');
  // …and 3 days ago: next in 4 days, inside the 5-day lead.
  await moveTo(ev5, at(-3 * DAY));
  await sweep();
  assert((await occurrences((await eventRow(ev5)).series_id)).length === 2, 'lead 5, 4 days out: due');
});

await run('inactive series, deleted series and archived groups are skipped', async () => {
  const { admin, groupId } = await group('rs-off', []);
  const mk = async () => {
    const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
    await moveTo(ev, at(-36e5));
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
  await moveTo(ev, at(-36e5));
  const { series_id } = await eventRow(ev);
  await patch('groups', `id=eq.${other.groupId}`, { archived_at: new Date().toISOString() });
  await sweep();
  assert((await occurrences(series_id)).length === 1, 'archived group skipped');
});

await run('a cancelled occurrence does not stop the series; a deleted one is never re-created', async () => {
  const { admin, groupId } = await group('rs-cancel', []);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: base(groupId, { series: series(7) }) });
  const last = at(-36e5);
  await moveTo(ev, last);
  await patch('events', `id=eq.${ev}`, { status: 'cancelled' });
  const { series_id } = await eventRow(ev);
  await sweep();
  const occ = await occurrences(series_id);
  assert(occ.length === 2 && occ[1].status === 'scheduled', 'next occurrence opened after a cancelled one');

  // Soft-delete that new occurrence. Were the last slot taken from live events only, the cancelled one
  // (1 h ago) would make that same slot due again and the sweep would re-create it.
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
  // Last occurrence 20 days ago → slots at -13 d and -6 d are past; the next future one is +1 d.
  const last = new Date(Date.now() - 20 * DAY);
  await moveTo(ev, last.toISOString());
  const { series_id } = await eventRow(ev);
  await sweep();
  await sweep();
  const occ = await occurrences(series_id);
  assert(occ.length === 2, `exactly one catch-up occurrence, got ${occ.length - 1}`);
  assert(sameInstant(occ[1].starts_at, new Date(last.getTime() + 21 * DAY).toISOString()), 'on the weekly grid, in the future');
});

await run('a due private series copies its invitations as pending and sends event_invite', async () => {
  const [a, b, c] = [await user('rs-priv-a'), await user('rs-priv-b'), await user('rs-priv-c')];
  const { admin, groupId } = await group('rs-priv', [a, b, c]);
  const ev = await rpc(admin.jwt, 'create_event', {
    p_payload: base(groupId, { is_private: true, series: series(7), invitees: [{ invitee_id: a.id }, { invitee_id: b.id }] }),
  });
  await rpc(a.jwt, 'accept_event_invitation', { p_event_id: ev });
  await moveTo(ev, at(-36e5));
  const { series_id } = await eventRow(ev);
  await sweep();
  const occ = await occurrences(series_id);
  assert(occ.length === 2, 'occurrence opened');
  const next = occ[1].id;
  const inv = await sel('event_invitations', `event_id=eq.${next}&select=invitee_id,status,invited_by`);
  assert(inv.length === 2 && inv.every((i) => i.status === 'pending' && i.invited_by === admin.id),
    'both invitations copied as pending, from the organizer');
  assert((await notifs(a, 'event_invite', next)).length === 1, 'a gets event_invite (even after accepting last week)');
  assert((await notifs(b, 'event_invite', next)).length === 1, 'b gets event_invite');
  assert((await notifs(c, 'event_created', next)).length === 0, 'the rest of the group is not told');
  assert((await sel('event_participants', `event_id=eq.${next}&select=id`)).length === 0, 'participants are not copied');
});

await run('duplicate_event copies manual_court_names', async () => {
  const org = await user('rs-dup');
  const ev = await rpc(org.jwt, 'create_event', {
    p_payload: base(null, { is_private: true, num_courts: 2, manual_court_names: ['North', 'South'] }),
  });
  const dup = await rpc(org.jwt, 'duplicate_event', { p_event_id: ev, p_overrides: { starts_at: at(10 * DAY) } });
  assert(JSON.stringify((await eventRow(dup)).manual_court_names) === '["North","South"]', 'copied');
});
