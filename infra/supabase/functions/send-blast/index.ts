import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendBatchEmails } from '../_shared/email.ts';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });

  let body: { blast_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  if (!body.blast_id) return json({ error: 'blast_id required' }, 400);

  // Load the blast (RLS: organizer-readable) for its title/description.
  const { data: blast, error: bErr } = await client
    .from('event_blasts')
    .select('title, description, channels')
    .eq('id', body.blast_id)
    .maybeSingle();
  if (bErr || !blast) return json({ error: 'blast_not_found' }, 404);
  if (!(blast.channels as string[]).includes('email')) return json({ ok: true, sent: 0 });

  // Recipient emails (organizer-gated RPC; reads auth.users server-side).
  const { data: recipients, error: rErr } = await client.rpc('blast_email_recipients', { p_blast_id: body.blast_id });
  if (rErr) return json({ error: rErr.message }, rErr.message?.includes('forbidden') ? 403 : 400);

  const list = (recipients ?? []) as { email: string }[];
  if (list.length === 0) return json({ ok: true, sent: 0 });

  const html = `<h2>${blast.title}</h2><p>${blast.description}</p>`;
  try {
    await sendBatchEmails(list.map((r) => ({ to: r.email, subject: blast.title as string, html })));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'send_failed' }, 500);
  }
  return json({ ok: true, sent: list.length });
});
