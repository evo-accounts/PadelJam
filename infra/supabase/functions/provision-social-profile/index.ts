// Provisions a profiles row for a social sign-in user (Apple or Google).
// Called by the mobile client immediately after sign-in succeeds.
// Security: reads identity from auth.users server-side — client cannot inject
// a foreign email into the globally-readable profiles table.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function resolveName(requestedName: string | undefined, metadata: Record<string, unknown>, email: string): string {
  if (requestedName?.trim()) return requestedName.trim().replace(/\s+/g, ' ');
  const meta = (metadata.full_name ?? metadata.name) as string | undefined;
  if (meta?.trim()) return meta.trim().replace(/\s+/g, ' ');
  // Derive from email local-part: "joao.pereira" -> "Joao Pereira"
  const local = email.split('@')[0] ?? '';
  const derived = local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return derived || 'Jammer';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify the caller's JWT.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });

  // Only allow social providers — reject OTP users so they still go through complete-account.
  const provider = (user.app_metadata?.provider as string | undefined) ?? '';
  if (!['apple', 'google'].includes(provider)) {
    return json({ error: 'not_social_provider' }, 403);
  }

  let body: { full_name?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const email = user.email;
  if (!email) return json({ error: 'no_email_on_user' }, 400);

  const fullName = resolveName(body.full_name, user.user_metadata ?? {}, email);

  const admin = createClient(url, serviceKey);

  // Idempotent upsert — ignoreDuplicates means a returning user's profile is untouched.
  const { error: upsertErr } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email,
      phone: null,
      full_name: fullName,
      terms_accepted_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (upsertErr) return json({ error: upsertErr.message }, 400);

  return json({ ok: true });
});
