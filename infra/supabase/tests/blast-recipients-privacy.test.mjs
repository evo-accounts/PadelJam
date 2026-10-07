// infra/supabase/tests/blast-recipients-privacy.test.mjs
//
// Migrations 0143 + 0144: organizers cannot read their participants' or invitees' email addresses.
// Before them, send-blast resolved recipients by calling blast_email_recipients AS THE SIGNED-IN
// ORGANIZER, so the RPC was granted to `authenticated` and any organizer could call it directly:
// invite a stranger to a private group-less event, record an email blast to 'invited' (which sends
// nothing by itself), and read the stranger's auth.users email. Now the addresses are resolved only
// by the service role — send-blast, after verifying the caller — through blast_email_recipients_for.
//
// `rpc(null, …)` runs as the service role (lib.mjs falls back to the service key), which is what
// send-blast's admin client is.
//
// SERVING THE FUNCTION: the send-blast cases hit the local gateway, which serves whatever checkout
// `supabase start` ran from (CI's db-tests job starts it from the branch). In a worktree, serve this
// branch's copy yourself and point SEND_BLAST_URL at it — the docker line is in the header of
// complete-account-consent.test.mjs.
import { BASE_URL, user, rpc, anonRpc, sel, insert, expectError, assert, run } from './lib.mjs';

const FN_URL = process.env.SEND_BLAST_URL || `${BASE_URL}/functions/v1/send-blast`;
const DENIED = 'permission denied for function';
const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);
const payload = (over = {}) => ({
  group_id: null, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Privacy ${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: true, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const emailOf = (u) => sel('profiles', `id=eq.${u.id}&select=email`).then((r) => r[0].email);
const optIn = (u) => insert('user_settings', { user_id: u.id, notifications_email: true, notifications_whatsapp: false });
const blast = (org, ev, over = {}) => rpc(org.jwt, 'send_event_blast', {
  p_event_id: ev, p_source_template_id: null, p_title: 'Hello', p_description: 'Body',
  p_image_path: null, p_channels: ['email'], p_send_to: 'invited', p_save: false, ...over,
}).then((r) => r[0]);
const emailRows = (blastId) =>
  sel('delivery_log', `blast_id=eq.${blastId}&channel=eq.email&select=status,attempt,sent_count,failed_count,error&order=attempt`);
const sendBlast = async (jwt, blastId) => {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify({ blast_id: blastId }),
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};

/** The exploit's setup: a private group-less event, a stranger invited, an email blast to 'invited'. */
async function invitedStrangerBlast() {
  const org = await user('bp-org');
  await rpc(org.jwt, 'set_account_plan', { p_plan: 'jammer_plus' }); // custom text on a group-less event
  const stranger = await user('bp-stranger');
  await optIn(stranger);
  const ev = await rpc(org.jwt, 'create_event', { p_payload: payload() });
  await rpc(org.jwt, 'invite_to_event', { p_event_id: ev, p_invitees: [{ invitee_id: stranger.id }] });
  const b = await blast(org, ev);
  return { org, stranger, ev, blastId: b.blast_id, sentToCount: b.sent_to_count };
}

const fx = await invitedStrangerBlast();

await run('an organizer CANNOT read invitee emails through blast_email_recipients (the old RPC)', async () => {
  await expectError(() => rpc(fx.org.jwt, 'blast_email_recipients', { p_blast_id: fx.blastId }), DENIED);
  await expectError(() => anonRpc('blast_email_recipients', { p_blast_id: fx.blastId }), DENIED);
});

await run('an organizer CANNOT call blast_email_recipients_for, not even naming themselves', async () => {
  await expectError(
    () => rpc(fx.org.jwt, 'blast_email_recipients_for', { p_blast_id: fx.blastId, p_organizer_id: fx.org.id }),
    DENIED,
  );
  await expectError(
    () => rpc(fx.stranger.jwt, 'blast_email_recipients_for', { p_blast_id: fx.blastId, p_organizer_id: fx.org.id }),
    DENIED,
  );
  await expectError(
    () => anonRpc('blast_email_recipients_for', { p_blast_id: fx.blastId, p_organizer_id: fx.org.id }),
    DENIED,
  );
});

await run('the service role (send-blast) CAN resolve the recipients for the verified organizer', async () => {
  const r = await rpc(null, 'blast_email_recipients_for', { p_blast_id: fx.blastId, p_organizer_id: fx.org.id });
  const got = r.map((x) => x.email).sort();
  assert(JSON.stringify(got) === JSON.stringify([await emailOf(fx.stranger)]), `the opted-in invitee, got ${JSON.stringify(got)}`);
  assert(fx.sentToCount === got.length, `send_event_blast's sent_to_count (${fx.sentToCount}) matches the list`);
});

await run('the service role CANNOT resolve recipients for anyone but the organizer', async () => {
  const someone = await user('bp-someone');
  await expectError(
    () => rpc(null, 'blast_email_recipients_for', { p_blast_id: fx.blastId, p_organizer_id: someone.id }),
    'forbidden',
  );
  await expectError(
    () => rpc(null, 'blast_email_recipients_for', { p_blast_id: fx.blastId, p_organizer_id: fx.stranger.id }),
    'forbidden',
  );
  await expectError(
    () => rpc(null, 'blast_email_recipients_for', { p_blast_id: fx.blastId, p_organizer_id: null }),
    'not authenticated',
  );
  await expectError(
    () => rpc(null, 'blast_email_recipients_for', { p_blast_id: '00000000-0000-0000-0000-000000000000', p_organizer_id: fx.org.id }),
    'blast_not_found',
  );
});

await run('a WhatsApp-only blast has no email recipients, even for the service role', async () => {
  const wa = await blast(fx.org, fx.ev, { p_title: 'Court 3', p_channels: ['whatsapp'], p_send_to: 'all' });
  const r = await rpc(null, 'blast_email_recipients_for', { p_blast_id: wa.blast_id, p_organizer_id: fx.org.id });
  assert(Array.isArray(r) && r.length === 0, 'no email recipients');
});

await run('send-blast refuses a caller with no session, and anyone but the organizer, before logging anything', async () => {
  const b = await blast(fx.org, fx.ev, { p_title: 'Refusals' });
  const anon = await sendBlast(null, b.blast_id);
  assert(anon.status === 401, `no session: expected 401, got ${anon.status}`);
  const other = await sendBlast(fx.stranger.jwt, b.blast_id);
  assert(other.status === 404 && other.body?.error === 'blast_not_found',
    `the invitee sees the same 404 as for a missing blast, got ${other.status} ${JSON.stringify(other.body)}`);
  assert((await emailRows(b.blast_id)).length === 0, 'no email delivery attempt was logged for either');
});

await run('send-blast resolves recipients through the service role for the verified organizer', async () => {
  // An audience with no opted-in address ('confirmed': nobody has joined), so nothing goes to Resend
  // whatever the environment. The row it logs is the proof: a 'sent' attempt with 0 recipients means
  // blast_email_recipients_for answered for this organizer. The send-blast that predates 0143/0144
  // would log 'failed' with "permission denied for function blast_email_recipients" here.
  const b = await blast(fx.org, fx.ev, { p_title: 'Nobody yet', p_send_to: 'confirmed' });
  assert(b.sent_to_count === 0, `no opted-in recipient in the audience, got ${b.sent_to_count}`);
  const res = await sendBlast(fx.org.jwt, b.blast_id);
  assert(res.status === 200 && res.body?.ok === true && res.body?.sent === 0,
    `send-blast returned ${res.status}: ${JSON.stringify(res.body)}`);
  const rows = await emailRows(b.blast_id);
  assert(rows.length === 1 && rows[0].status === 'sent' && rows[0].attempt === 1 && rows[0].sent_count === 0,
    `one 'sent' email attempt with 0 recipients, got ${JSON.stringify(rows)}`);
});

await run('send-blast answers a WhatsApp-only blast without an email attempt', async () => {
  const wa = await blast(fx.org, fx.ev, { p_title: 'Court 4', p_channels: ['whatsapp'], p_send_to: 'all' });
  const res = await sendBlast(fx.org.jwt, wa.blast_id);
  assert(res.status === 200 && res.body?.ok === true && res.body?.sent === 0, `got ${res.status}: ${JSON.stringify(res.body)}`);
  assert((await emailRows(wa.blast_id)).length === 0, 'no email delivery row');
});

await run('the organizer RPCs that stay signed-in still work: send_event_blast, retry_blast, roster CSV', async () => {
  // A failed email attempt (what send-blast logs) makes the blast retryable by its organizer.
  await insert('delivery_log', { channel: 'email', blast_id: fx.blastId, status: 'failed', attempt: 1, failed_count: 1, error: 'x' });
  await rpc(fx.org.jwt, 'retry_blast', { p_blast_id: fx.blastId });
  await expectError(() => rpc(fx.stranger.jwt, 'retry_blast', { p_blast_id: fx.blastId }), 'forbidden');

  const csv = await rpc(fx.org.jwt, 'event_roster_csv', { p_event_id: fx.ev });
  assert(csv.startsWith('name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount'), 'roster CSV header');
  assert(!csv.includes('@'), 'the roster CSV carries no email address');
  await expectError(() => rpc(fx.stranger.jwt, 'event_roster_csv', { p_event_id: fx.ev }), 'forbidden');
});
