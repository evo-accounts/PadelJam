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

  // Load the blast (RLS: organizer-readable) for its title/description.
  const { data: blast, error: bErr } = await client
    .from('event_blasts')
    .select('title, description, channels')
    .eq('id', body.blast_id)
    .maybeSingle();
  if (bErr || !blast) return json({ error: 'blast_not_found' }, 404);
  // WhatsApp is shared from the organizer's device (0124); only email is delivered from here.
  if (!hasEmailChannel(blast.channels as string[])) return json({ ok: true, sent: 0 });

  // Recipient emails (organizer-gated RPC; reads auth.users server-side).
  const { data: recipients, error: rErr } = await client.rpc('blast_email_recipients', { p_blast_id: body.blast_id });
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
