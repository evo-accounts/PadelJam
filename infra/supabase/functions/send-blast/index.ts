// Delivers a blast's email channel. The recipients' addresses never reach the caller.
//
// Who may send is decided HERE, from the verified session: auth.getUser() on the forwarded JWT,
// then "does this user organize the blast's event?". Only then are the addresses resolved, with
// the SERVICE-ROLE client, through blast_email_recipients_for(blast, organizer) — a function only
// service_role may execute, which re-checks the organizer against the id passed here (migration
// 0143). Before 0143/0144 the lookup ran as the signed-in caller (blast_email_recipients), so that
// RPC had to be granted to `authenticated`, and any organizer could call it straight through
// /rest/v1/rpc to read their invitees' raw emails without sending anything.
//
// DEPLOY: hosted 0143 must be pasted before this is deployed (or the RPC answers PGRST202 and the
// attempt is logged 'failed'), and 0144 only after — 0144's header has the gate.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendBatchEmails } from '../_shared/email.ts';
import { hasEmailChannel, nextEmailAttempt, renderBlastEmailHtml } from '../_shared/blast.ts';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // The caller, verified by GoTrue. Everything below uses user.id, never an id from the body.
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });

  let body: { blast_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  if (!body.blast_id) return json({ error: 'blast_id required' }, 400);

  async function logEmailDelivery(ok: boolean, sentCount: number, failedCount: number, error: string | null) {
    try {
      // Email attempts only: since 0124 the RPC also logs a WhatsApp 'shared' row for the blast.
      const { data } = await admin.from('delivery_log').select('channel, attempt')
        .eq('blast_id', body.blast_id).eq('channel', 'email');
      const attempt = nextEmailAttempt(data as { channel: string; attempt: number }[] | null);
      await admin.from('delivery_log').insert({
        channel: 'email', blast_id: body.blast_id, attempt,
        status: ok ? 'sent' : 'failed', sent_count: sentCount, failed_count: failedCount, error });
    } catch { /* best-effort */ }
  }

  // Load the blast AS THE CALLER (RLS "event_blasts: read" is is_event_organizer(event_id, auth.uid())),
  // so anyone but the organizer gets the same 404 as for a blast that does not exist.
  const { data: blast, error: bErr } = await client
    .from('event_blasts')
    .select('event_id, title, description, channels')
    .eq('id', body.blast_id)
    .maybeSingle();
  if (bErr || !blast) return json({ error: 'blast_not_found' }, 404);
  // WhatsApp is shared from the organizer's device (0124); only email is delivered from here. Checked
  // before any service-role call, so a WhatsApp-only blast never touches the admin client or the log.
  if (!hasEmailChannel(blast.channels as string[])) return json({ ok: true, sent: 0 });

  // The organizer check, stated outright rather than left to that policy: the addresses are read
  // with the service role below, so this must hold even if event_blasts ever becomes readable to
  // more people (co-organizers, community admins). blast_email_recipients_for checks it again.
  const { data: ev, error: eErr } = await admin
    .from('events')
    .select('organizer_id')
    .eq('id', blast.event_id as string)
    .maybeSingle();
  if (eErr) { await logEmailDelivery(false, 0, 0, eErr.message); return json({ error: eErr.message }, 500); }
  if (!ev || ev.organizer_id !== user.id) return json({ error: 'forbidden' }, 403);

  // Recipient emails: service-role-only RPC (reads auth.users), given the VERIFIED organizer id.
  const { data: recipients, error: rErr } = await admin.rpc('blast_email_recipients_for', {
    p_blast_id: body.blast_id,
    p_organizer_id: user.id,
  });
  if (rErr) { await logEmailDelivery(false, 0, 0, rErr.message); return json({ error: rErr.message }, rErr.message?.includes('forbidden') ? 403 : 400); }

  const list = (recipients ?? []) as { email: string }[];
  if (list.length === 0) { await logEmailDelivery(true, 0, 0, null); return json({ ok: true, sent: 0 }); }

  const html = renderBlastEmailHtml(blast.title as string, blast.description as string);
  try {
    await sendBatchEmails(list.map((r) => ({ to: r.email, subject: blast.title as string, html })));
  } catch (e) {
    await logEmailDelivery(false, 0, list.length, e instanceof Error ? e.message : 'send_failed');
    return json({ error: e instanceof Error ? e.message : 'send_failed' }, 500);
  }
  await logEmailDelivery(true, list.length, 0, null);
  return json({ ok: true, sent: list.length });
});
