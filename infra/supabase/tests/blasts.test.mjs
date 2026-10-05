// infra/supabase/tests/blasts.test.mjs
//
// Migration 0124 (UX Audit — Manage Event, plan PR "0124 — blasts": D6, B10, UX-MEVT-18), through
// PostgREST as the signed-in organizer. Fixtures no RPC sets (participant statuses, stale
// invitations, opt-ins, a failed delivery) are written with the service role.
import { user, rpc, sel, insert, expectError, assert, run, BASE_URL, ANON } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);

const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Blast ${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: true, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const groupless = (org, over = {}) => rpc(org.jwt, 'create_event', { p_payload: payload(null, over) });

/** A community (starter unless `plan`) and an event in its general group, organized by its admin. */
async function communityEvent(t, plan) {
  const admin = await user(`${t}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Blast ${t} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  if (plan) await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: plan, status: 'active', provider: 'manual' });
  const [g] = await sel('groups', `community_id=eq.${communityId}&select=id&order=created_at&limit=1`);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: payload(g.id, { is_private: false }) });
  return { admin, communityId, groupId: g.id, ev };
}

const send = (org, ev, over = {}) => rpc(org.jwt, 'send_event_blast', {
  p_event_id: ev, p_source_template_id: null, p_title: 'Hello', p_description: 'Custom body',
  p_image_path: null, p_channels: ['email'], ...over,
}).then((r) => r[0]);
const blastRow = (id) => sel('event_blasts', `id=eq.${id}&select=*`).then((r) => r[0]);
const deliveries = (id) => sel('delivery_log', `blast_id=eq.${id}&select=channel,status,attempt,sent_count&order=attempt`);
const recipients = (org, id) => rpc(org.jwt, 'blast_email_recipients', { p_blast_id: id }).then((r) => r.map((x) => x.email).sort());
const emailOf = (u) => sel('profiles', `id=eq.${u.id}&select=email`).then((r) => r[0].email);
const optIn = (u, email = true) => insert('user_settings', { user_id: u.id, notifications_email: email, notifications_whatsapp: false });

const templates = await sel('blast_templates', 'select=id,title,description,image_path&is_active=eq.true&order=created_at');
assert(templates.length >= 1, 'seeded blast templates');
const tpl = templates[0];

// ---------------------------------------------------------------------------------------------
// D6: group-less events; the organizer's account plan decides customisation
// ---------------------------------------------------------------------------------------------
await run('D6/B10: a free organizer on a group-less event sends templates only, as they are', async () => {
  const org = await user('free-org');
  const ev = await groupless(org);
  assert((await rpc(org.jwt, 'can_customize_event_blast', { p_event_id: ev })) === false, 'free: no customisation');
  assert((await rpc(org.jwt, 'can_customize_blast', { p_event_id: ev })) === false, 'the 0072 name agrees');

  await expectError(() => send(org, ev), 'blast_customization_required');                 // no template
  await expectError(() => send(org, ev, { p_source_template_id: tpl.id }), 'blast_customization_required'); // edited
  await expectError(() => send(org, ev, { p_source_template_id: tpl.id, p_title: null, p_description: null, p_save: true }), 'blast_customization_required');
  await expectError(() => send(org, ev, { p_source_template_id: tpl.id, p_title: null, p_description: null, p_image_path: 'mine.png' }), 'blast_customization_required');

  // Template id only: the server fills the text. The template's own text is accepted too.
  const a = await send(org, ev, { p_source_template_id: tpl.id, p_title: null, p_description: null });
  const row = await blastRow(a.blast_id);
  assert(row.title === tpl.title.trim() && row.description === tpl.description.trim(), 'filled from the template');
  assert(row.source_template_id === tpl.id && row.send_to === 'all', 'template + default scope recorded');
  await send(org, ev, { p_source_template_id: tpl.id, p_title: ` ${tpl.title} `, p_description: tpl.description });

  await expectError(() => rpc(org.jwt, 'list_saved_blasts', { p_event_id: ev }), 'blast_customization_required');
  await expectError(() => rpc(org.jwt, 'save_blast', { p_event_id: ev, p_title: 'T', p_description: 'D' }), 'blast_customization_required');
});

await run('D6: a Jammer+ organizer customises and saves on a group-less event (owner-scoped)', async () => {
  const org = await user('plus-org');
  await rpc(org.jwt, 'set_account_plan', { p_plan: 'jammer_plus' });
  const ev = await groupless(org);
  const ev2 = await groupless(org);
  assert((await rpc(org.jwt, 'can_customize_event_blast', { p_event_id: ev })) === true, 'jammer+: customisation');

  const r = await send(org, ev, { p_title: '  Rain plan ', p_description: 'We move indoors.', p_save: true });
  assert(r.blast_id && (await blastRow(r.blast_id)).title === 'Rain plan', 'custom text sent, trimmed');
  // A custom edit on top of a template keeps the template link; omitted fields come from it.
  const t = await send(org, ev, { p_source_template_id: tpl.id, p_title: 'My take', p_description: null });
  const trow = await blastRow(t.blast_id);
  assert(trow.title === 'My take' && trow.description === tpl.description.trim(), 'template fills the omitted field');

  // "Your blasts" follows the organizer to their other group-less events.
  const saved = await rpc(org.jwt, 'list_saved_blasts', { p_event_id: ev2 });
  assert(saved.length === 1 && saved[0].title === 'Rain plan' && saved[0].created_by === org.id, 'saved at send time');
  const [db] = await sel('saved_blasts', `id=eq.${saved[0].id}&select=community_id,owner_user_id`);
  assert(db.community_id === null && db.owner_user_id === org.id, 'owner scope');

  const id2 = await rpc(org.jwt, 'save_blast', { p_event_id: ev, p_title: 'Second', p_description: 'Body', p_source_template_id: tpl.id });
  await rpc(org.jwt, 'update_saved_blast', { p_saved_blast_id: id2, p_title: 'Second, edited', p_description: 'Body 2', p_image_path: 'blasts/x.png' });
  const list = await rpc(org.jwt, 'list_saved_blasts', { p_event_id: ev });
  assert(list.length === 2 && list[0].id === id2 && list[0].title === 'Second, edited' && list[0].image_path === 'blasts/x.png', 'updated, most recent first');

  // Someone else can neither list, edit nor delete them.
  const other = await user('plus-other');
  await rpc(other.jwt, 'set_account_plan', { p_plan: 'jammer_plus' });
  await expectError(() => rpc(other.jwt, 'list_saved_blasts', { p_event_id: ev }), 'forbidden');
  await expectError(() => rpc(other.jwt, 'update_saved_blast', { p_saved_blast_id: id2, p_title: 'x', p_description: 'y' }), 'saved_blast_not_found');
  await expectError(() => rpc(other.jwt, 'delete_saved_blast', { p_saved_blast_id: id2 }), 'saved_blast_not_found');
  assert((await rpc(other.jwt, 'can_customize_event_blast', { p_event_id: ev })) === false, 'not the organizer: false');

  // Downgraded: no listing or editing, but the owner can still clean up.
  await rpc(org.jwt, 'set_account_plan', { p_plan: 'free' });
  await expectError(() => rpc(org.jwt, 'update_saved_blast', { p_saved_blast_id: id2, p_title: 'x', p_description: 'y' }), 'blast_customization_required');
  await rpc(org.jwt, 'delete_saved_blast', { p_saved_blast_id: id2 });
  assert((await sel('saved_blasts', `id=eq.${id2}&select=id`)).length === 0, 'deleted');
});

await run('B10: text limits, unknown template, bad channel and scope', async () => {
  const org = await user('lim-org');
  await rpc(org.jwt, 'set_account_plan', { p_plan: 'jammer_plus' });
  const ev = await groupless(org);
  await expectError(() => send(org, ev, { p_title: 'x'.repeat(81) }), 'blast_too_long');
  await expectError(() => send(org, ev, { p_description: 'x'.repeat(1001) }), 'blast_too_long');
  await expectError(() => send(org, ev, { p_title: '  ' }), 'blast_incomplete');
  await expectError(() => send(org, ev, { p_source_template_id: '00000000-0000-0000-0000-000000000000' }), 'template_not_found');
  await expectError(() => send(org, ev, { p_channels: [] }), 'channels_required');
  await expectError(() => send(org, ev, { p_channels: ['sms'] }), 'invalid_channel');
  await expectError(() => send(org, ev, { p_send_to: 'everyone' }), 'invalid_send_to');
  const stranger = await user('lim-stranger');
  await expectError(() => send(stranger, ev), 'forbidden');
  await expectError(() => rpc(org.jwt, 'save_blast', { p_event_id: ev, p_title: 'x'.repeat(81), p_description: 'D' }), 'blast_too_long');
});

// ---------------------------------------------------------------------------------------------
// D6: group events — the community's custom_broadcasts feature; community-scoped saved blasts
// ---------------------------------------------------------------------------------------------
await run('D6: a Starter community event is template-only; a Basic one customises and shares saved blasts', async () => {
  const starter = await communityEvent('st');
  assert((await rpc(starter.admin.jwt, 'can_customize_event_blast', { p_event_id: starter.ev })) === false, 'starter: no custom_broadcasts');
  await expectError(() => send(starter.admin, starter.ev), 'blast_customization_required');
  await send(starter.admin, starter.ev, { p_source_template_id: tpl.id, p_title: null, p_description: null });

  const basic = await communityEvent('ba', 'basic');
  assert((await rpc(basic.admin.jwt, 'can_customize_event_blast', { p_event_id: basic.ev })) === true, 'basic: custom_broadcasts');
  await send(basic.admin, basic.ev, { p_title: 'Club news', p_description: 'New balls!', p_save: true });
  const ev2 = await rpc(basic.admin.jwt, 'create_event', { p_payload: payload(basic.groupId, { is_private: false }) });
  const saved = await rpc(basic.admin.jwt, 'list_saved_blasts', { p_event_id: ev2 });
  assert(saved.length === 1 && saved[0].title === 'Club news', 'shared across the community\'s events');
  const [db] = await sel('saved_blasts', `id=eq.${saved[0].id}&select=community_id,owner_user_id`);
  assert(db.community_id === basic.communityId && db.owner_user_id === null, 'community scope');

  // A plain member who did not write it cannot touch it.
  const m = await user('ba-member');
  await insert('community_members', { community_id: basic.communityId, user_id: m.id, role: 'member' });
  await expectError(() => rpc(m.jwt, 'update_saved_blast', { p_saved_blast_id: saved[0].id, p_title: 'x', p_description: 'y' }), 'saved_blast_not_found');
  // …a member who did, can, and so can an admin.
  await insert('saved_blasts', { community_id: basic.communityId, created_by: m.id, title: 'Mine', description: 'Body' }).then(async ([row]) => {
    await rpc(m.jwt, 'update_saved_blast', { p_saved_blast_id: row.id, p_title: 'Mine 2', p_description: 'Body' });
    await rpc(basic.admin.jwt, 'delete_saved_blast', { p_saved_blast_id: row.id });
  });
});

// ---------------------------------------------------------------------------------------------
// D6: send_to scopes and email opt-in
// ---------------------------------------------------------------------------------------------
await run('D6: send_to all / confirmed / invited / waiting_list, email opt-in, alias all_members', async () => {
  const org = await user('scope-org');
  await rpc(org.jwt, 'set_account_plan', { p_plan: 'jammer_plus' });
  const [conf, wait, invRow, invPending, stale, optedOut] = [
    await user('sc-conf'), await user('sc-wait'), await user('sc-invrow'), await user('sc-invpend'),
    await user('sc-stale'), await user('sc-out'),
  ];
  const ev = await groupless(org, { organizer_role: 'organizing_and_playing' });
  for (const row of [
    { event_id: ev, user_id: conf.id, status: 'confirmed' },
    { event_id: ev, user_id: wait.id, status: 'waiting_list', waiting_list_position: 1 },
    { event_id: ev, user_id: invRow.id, status: 'invited' },
    { event_id: ev, user_id: stale.id, status: 'confirmed' },
    { event_id: ev, user_id: optedOut.id, status: 'confirmed' },
  ]) await insert('event_participants', row);
  for (const row of [
    { event_id: ev, invitee_id: invPending.id, invited_by: org.id },
    // A pending invitation next to a confirmed row: confirmed, not "invited".
    { event_id: ev, invitee_id: stale.id, invited_by: org.id },
    // A contact-only invitation (no account) is never a recipient.
    { event_id: ev, invitee_name: 'Contact', invitee_email: 'contact@example.test', invited_by: org.id },
  ]) await insert('event_invitations', row);
  for (const u of [org, conf, wait, invRow, invPending, stale]) await optIn(u);
  await optIn(optedOut, false);

  const expect = async (sendTo, audience, who) => {
    const r = await send(org, ev, { p_send_to: sendTo });
    const want = (await Promise.all(who.map(emailOf))).sort();
    assert(r.audience_count === audience, `${sendTo}: audience ${audience}, got ${r.audience_count}`);
    assert(r.sent_to_count === want.length, `${sendTo}: ${want.length} email recipients, got ${r.sent_to_count}`);
    assert(JSON.stringify(await recipients(org, r.blast_id)) === JSON.stringify(want), `${sendTo}: recipient emails`);
    assert((await blastRow(r.blast_id)).audience_count === audience, `${sendTo}: audience stored`);
    return r;
  };
  // The organizer (confirmed, opted in) is never in their own audience.
  await expect('all', 6, [conf, wait, invRow, invPending, stale]);
  await expect('confirmed', 3, [conf, stale]);
  await expect('invited', 2, [invRow, invPending]);
  await expect('waiting_list', 1, [wait]);
  const legacy = await expect('all_members', 6, [conf, wait, invRow, invPending, stale]);
  assert((await blastRow(legacy.blast_id)).send_to === 'all', 'all_members is stored as all');

  // Shipped clients: the six-argument call still resolves (defaults: all, no save).
  const [old] = await rpc(org.jwt, 'send_event_blast', {
    p_event_id: ev, p_source_template_id: null, p_title: 'Old', p_description: 'Client', p_image_path: null, p_channels: ['email'],
  });
  assert(old.sent_to_count === 5 && (await blastRow(old.blast_id)).send_to === 'all', 'six-argument call');
});

// ---------------------------------------------------------------------------------------------
// D6: WhatsApp is shared from the organizer's device
// ---------------------------------------------------------------------------------------------
await run("D6: WhatsApp is recorded as 'shared' with the rendered text; no email, not retryable", async () => {
  const org = await user('wa-org');
  await rpc(org.jwt, 'set_account_plan', { p_plan: 'jammer_plus' });
  const p = await user('wa-p');
  const ev = await groupless(org);
  await insert('event_participants', { event_id: ev, user_id: p.id, status: 'confirmed' });
  await optIn(p);

  const wa = await send(org, ev, { p_title: 'Court 3', p_description: 'We play on court 3.', p_channels: ['whatsapp', 'whatsapp'] });
  assert(wa.share_text === '*Court 3*\n\nWe play on court 3.', `share text, got ${JSON.stringify(wa.share_text)}`);
  assert(wa.sent_to_count === 0 && wa.audience_count === 1, 'no email recipients; audience 1');
  const row = await blastRow(wa.blast_id);
  assert(JSON.stringify(row.channels) === JSON.stringify(['whatsapp']), 'channels deduplicated');
  const d = await deliveries(wa.blast_id);
  assert(d.length === 1 && d[0].channel === 'whatsapp' && d[0].status === 'shared' && d[0].sent_count === 1, `shared row, got ${JSON.stringify(d)}`);
  assert((await recipients(org, wa.blast_id)).length === 0, 'a WhatsApp-only blast has no email recipients');
  await expectError(() => rpc(org.jwt, 'retry_blast', { p_blast_id: wa.blast_id }), 'not_retryable');

  // Both channels: the email attempt is judged on its own, beside the 'shared' row.
  const both = await send(org, ev, { p_channels: ['email', 'whatsapp'] });
  assert(both.sent_to_count === 1 && both.share_text === '*Hello*\n\nCustom body', 'email + share text');
  await expectError(() => rpc(org.jwt, 'retry_blast', { p_blast_id: both.blast_id }), 'not_retryable'); // no email attempt yet
  await insert('delivery_log', { channel: 'email', blast_id: both.blast_id, status: 'failed', attempt: 1, failed_count: 1, error: 'x' });
  await rpc(org.jwt, 'retry_blast', { p_blast_id: both.blast_id });
  // 'shared' belongs to WhatsApp only.
  await expectError(() => insert('delivery_log', { channel: 'email', blast_id: both.blast_id, status: 'shared', attempt: 2 }), 'delivery_shared_is_whatsapp');
  // Email-only: no share text, no WhatsApp row.
  const mail = await send(org, ev);
  assert(mail.share_text === null && (await deliveries(mail.blast_id)).length === 0, 'email-only: nothing shared');
});

// ---------------------------------------------------------------------------------------------
// Privileges
// ---------------------------------------------------------------------------------------------
await run('internal helpers and the saved_blasts table are closed to clients', async () => {
  const u = await user('priv');
  const Z = '00000000-0000-0000-0000-000000000000';
  for (const [name, args] of [
    ['_blast_scope_can_customize', { p_community: Z, p_owner: null }],
    ['_blast_audience', { p_event_id: Z, p_send_to: 'all' }],
    ['_blast_check_text', { p_title: 'a', p_description: 'b' }],
  ]) await expectError(() => rpc(u.jwt, name, args), 'permission denied');
  const r = await fetch(`${BASE_URL}/rest/v1/saved_blasts?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${u.jwt}` },
  });
  assert(r.status === 401 || r.status === 403, `saved_blasts is not readable by a user, got ${r.status}`);
});

