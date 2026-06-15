// Soft-deletes the caller's account: runs soft_delete_account() as the user (anonymize + drop
// memberships/social rows), then bans the auth user so re-login is blocked. Hard delete is not
// possible (NOT NULL RESTRICT FKs from owned communities/events).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });

  // 1) Anonymize + drop the user's data (runs as the caller → auth.uid()).
  const { error: rpcErr } = await userClient.rpc('soft_delete_account');
  if (rpcErr) return json({ error: rpcErr.message }, 400);

  // 2) Ban the auth user so they cannot sign in again (~100 years).
  const admin = createClient(url, serviceKey);
  const { error: banErr } = await admin.auth.admin.updateUserById(user.id, { ban_duration: '876000h' });
  if (banErr) return json({ error: banErr.message }, 400);

  return json({ ok: true });
});
