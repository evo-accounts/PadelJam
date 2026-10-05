// infra/supabase/tests/partner-request-notifications.test.mjs
//
// Migration 0118: a withdrawn partner request takes its unread `partner_request` notification with
// it (W1), and request_partner never leaves two unread ones for the same requester → target + event
// (W2). Found in the browser pass on main: withdraw + re-invite notified the target twice.
import { user, rpc, sel, insert, patch, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);

const teamEvent = (org, invitees) =>
  rpc(org.jwt, 'create_event', {
    p_payload: {
      group_id: null, event_type: 'americano', specification: 'team', scoring_mode: 'points', scoring_value: 24,
      organizer_role: 'organizing_only', name: `PR notes ${tag()}`, venue_id: null,
      manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
      location_lat: null, location_lng: null, location_text: null,
      num_courts: 2, starts_at: hoursFromNow(72), duration_minutes: 90,
      allow_standby: false, standby_spots: null, is_private: true, players_submit_results: false,
      entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
      description: null, thumbnail_path: null, series: null, court_ids: null,
      invitees: invitees.map((u) => ({ invitee_id: u.id })),
    },
  });

const notes = (ev, to, from) =>
  sel('notifications', `user_id=eq.${to.id}&type=eq.partner_request&event_id=eq.${ev}&actor_id=eq.${from.id}&select=id,ref_id,read_at,cta_done&order=created_at.desc`);
const reqId = async (ev, from, to) =>
  (await sel('partner_requests', `event_id=eq.${ev}&requester_id=eq.${from.id}&target_id=eq.${to.id}&select=id`))[0]?.id;
const settled = (n) => n != null && n.cta_done === true && n.read_at !== null;

await run('withdraw deletes the unread notification; a re-invite notifies once', async () => {
  const [org, a, b] = [await user('prn-org'), await user('prn-a'), await user('prn-b')];
  const ev = await teamEvent(org, [a, b]);

  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] });
  assert((await notes(ev, b, a)).length === 1, 'one notification for the ask');
  await rpc(a.jwt, 'withdraw_partner_request', { p_request_id: await reqId(ev, a, b) });
  assert((await notes(ev, b, a)).length === 0, 'withdrawn before it was read → gone');

  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] });
  const after = await notes(ev, b, a);
  assert(after.length === 1, `withdraw + re-invite leaves exactly one notification, got ${after.length}`);
  assert(after[0].read_at === null && after[0].cta_done === false, 'and it is open');
  assert(after[0].ref_id === (await reqId(ev, a, b)), 'pointing at the live request');
});

await run('a notification the target already read is settled, not deleted, on withdraw', async () => {
  const [org, a, b] = [await user('prn-r-org'), await user('prn-r-a'), await user('prn-r-b')];
  const ev = await teamEvent(org, [a, b]);

  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] });
  const [n] = await notes(ev, b, a);
  await patch('notifications', `id=eq.${n.id}`, { read_at: new Date().toISOString() });
  await rpc(a.jwt, 'withdraw_partner_request', { p_request_id: await reqId(ev, a, b) });
  const kept = await notes(ev, b, a);
  assert(kept.length === 1 && settled(kept[0]), 'read → kept in the history, done');

  // A re-invite is a new ask: one open notification beside the settled one.
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] });
  const all = await notes(ev, b, a);
  assert(all.length === 2 && all.filter((x) => x.read_at === null).length === 1, 'exactly one unread');
});

await run('leaving with a pending ask deletes its unread notification', async () => {
  const [org, a, b] = [await user('prn-l-org'), await user('prn-l-a'), await user('prn-l-b')];
  const ev = await teamEvent(org, [a, b]);
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] });
  await rpc(a.jwt, 'leave_event', { p_event_id: ev });
  assert((await notes(ev, b, a)).length === 0, 'requester left → gone');
});

await run('accept, decline and system close still settle the notification (0113)', async () => {
  const [org, a, b, c, d] = [await user('prn-s-org'), await user('prn-s-a'), await user('prn-s-b'), await user('prn-s-c'), await user('prn-s-d')];
  const ev = await teamEvent(org, [a, b, c, d]);

  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id, c.id] });
  await rpc(b.jwt, 'accept_partner_request', { p_request_id: await reqId(ev, a, b) });
  assert(settled((await notes(ev, b, a))[0]), 'accepted → settled');
  assert(settled((await notes(ev, c, a))[0]), 'closed by the system → settled, not deleted');

  await rpc(c.jwt, 'request_partner', { p_event_id: ev, p_targets: [d.id] });
  await rpc(d.jwt, 'decline_partner_request', { p_request_id: await reqId(ev, c, d) });
  assert(settled((await notes(ev, d, c))[0]), 'declined → settled');
});

await run('request_partner re-points a standing unread notification instead of adding one', async () => {
  const [org, a, b] = [await user('prn-d-org'), await user('prn-d-a'), await user('prn-d-b')];
  const ev = await teamEvent(org, [a, b]);
  // An unread ask from a to b that points at no live request (as a pre-0118 leftover would).
  await insert('notifications', {
    user_id: b.id, type: 'partner_request', actor_id: a.id, event_id: ev, ref_id: crypto.randomUUID(),
    actor_name: 'old', entity_name: 'old',
  });
  await rpc(a.jwt, 'request_partner', { p_event_id: ev, p_targets: [b.id] });
  const all = await notes(ev, b, a);
  assert(all.length === 1, `still one notification, got ${all.length}`);
  assert(all[0].ref_id === (await reqId(ev, a, b)) && all[0].cta_done === false, 're-pointed at the live request');
});
