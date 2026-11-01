// infra/supabase/tests/series-invite-scope.test.mjs
//
// Migration 0147: _materialize_next copies a private series' invitations to the next occurrence
// only for invitees who are still invitable (same scope as invite_to_event / create_event, 0146):
// still a member of the group, not blocked with the organizer (either direction), not deleted.
// Ineligible invitees are skipped silently; the occurrence is still opened for everyone else.
import { user, rpc, sel, insert, patch, assert, run } from './lib.mjs';

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
/** Move a series' FIRST (only) event in time (service role; update_event would refuse a past start).
 *  Since 0123 the weekly grid hangs off event_series.grid_anchor, which that event set, so the
 *  anchor moves with it — as if the series had been created at that time. */
const moveTo = async (ev, iso) => {
  await patch('events', `id=eq.${ev}`, { starts_at: iso });
  const [{ series_id: seriesId }] = await sel('events', `id=eq.${ev}&select=series_id`);
  if (seriesId) await patch('event_series', `id=eq.${seriesId}`, { grid_anchor: iso });
};
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

await run('series copies only invitable invitees (sweep, then the organizer path)', async () => {
  const [a, b, c, d, e] = [await user('sis-a'), await user('sis-b'), await user('sis-c'),
    await user('sis-d'), await user('sis-e')];
  const { admin, groupId } = await group('sis', [a, b, c, d, e]);
  const all = [a, b, c, d, e];
  const ev = await rpc(admin.jwt, 'create_event', {
    p_payload: base(groupId, { is_private: true, series: series(7), invitees: all.map((u) => ({ invitee_id: u.id })) }),
  });
  const { series_id } = await eventRow(ev);

  await rpc(b.jwt, 'leave_group', { p_group_id: groupId });          // b leaves the group
  await rpc(c.jwt, 'block_user', { p_target: admin.id });             // c blocks the organizer
  await rpc(admin.jwt, 'block_user', { p_target: d.id });             // the organizer blocks d
  await patch('profiles', `id=eq.${e.id}`, { deleted_at: new Date().toISOString() }); // e is deleted

  // If any step above removed the old invitation, put it back (service role) so that the filter
  // in _materialize_next, not a side effect, is what is under test.
  const restore = async (eventId) => {
    for (const u of all) {
      const have = await sel('event_invitations', `event_id=eq.${eventId}&invitee_id=eq.${u.id}&select=id`);
      if (!have.length) {
        await insert('event_invitations', { event_id: eventId, invitee_id: u.id, status: 'pending', invited_by: admin.id });
      }
    }
  };
  await restore(ev);
  assert((await sel('event_invitations', `event_id=eq.${ev}&select=id`)).length === 5, 'source has all five invitations');

  await moveTo(ev, slotBefore(2 * H));
  await sweep();                                                       // 6: the sweep does not fail
  const occ = await occurrences(series_id);
  assert(occ.length === 2, `occurrence opened (${occ.length})`);
  const next = occ[1].id;
  const inv = await sel('event_invitations', `event_id=eq.${next}&select=invitee_id,status,invited_by`);
  assert(inv.length === 1 && inv[0].invitee_id === a.id && inv[0].status === 'pending' && inv[0].invited_by === admin.id,
    `only a is copied, as pending (got ${inv.length})`);                // 1
  assert((await notifs(a, 'event_invite', next)).length === 1, 'a gets event_invite');
  for (const [u, why] of [[b, 'left the group'], [c, 'blocked the organizer'], [d, 'blocked by the organizer'], [e, 'deleted']]) {
    assert(!inv.some((i) => i.invitee_id === u.id), `${why}: not copied`); // 2-5
  }

  // 7: the organizer path. Give the new occurrence the full list again, then tap.
  await restore(next);
  const third = await rpc(admin.jwt, 'materialize_occurrence', { p_after_event_id: next });
  assert((await occurrences(series_id)).length === 3, 'third occurrence opened');
  const inv3 = await sel('event_invitations', `event_id=eq.${third}&select=invitee_id`);
  assert(inv3.length === 1 && inv3[0].invitee_id === a.id, `organizer path: only a invited (got ${inv3.length})`);
});
