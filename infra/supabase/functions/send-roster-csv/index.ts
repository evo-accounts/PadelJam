import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding/base64';
import { sendEmail } from '../_shared/email.ts';

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
  if (!user.email) return json({ error: 'no_email' }, 400);

  let body: { event_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  if (!body.event_id) return json({ error: 'event_id required' }, 400);

  const { data: csv, error } = await client.rpc('event_roster_csv', { p_event_id: body.event_id });
  if (error) return json({ error: error.message }, error.message?.includes('forbidden') ? 403 : 400);

  try {
    await sendEmail({
      to: user.email,
      subject: 'Padel Jam — attendance & revenue',
      html: '<p>Your event roster CSV is attached.</p>',
      attachments: [{ filename: 'roster.csv', content: encodeBase64(csv as string) }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'send_failed';
    // Surface the unconfigured case as 200 data so the client can show a friendly message
    // (functions.invoke only throws on non-2xx).
    if (msg === 'email_not_configured') return json({ ok: false, error: 'email_not_configured' }, 200);
    return json({ error: msg }, 500);
  }
  return json({ ok: true });
});
