// Completes a new account: attaches the SECOND identifier (phone if the user started via email, or
// email if via phone) + a password to the existing auth.users row, then creates the profiles row
// SERVER-SIDE from the identifiers actually persisted on auth.users. Doing profile creation here
// (not on the client) prevents a client from inserting a profile with an email/phone that isn't
// theirs (profiles is globally readable). The secondary identifier is set lazily (unconfirmed) per
// Padel Jam AU-07. Requires the service-role key, so this must run server-side only.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const E164 = /^\+[1-9]\d{6,14}$/;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Resolve the caller from their JWT.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });

  let body: { phone?: string; email?: string; password?: string; full_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const { phone, email, password, full_name } = body;

  // Server-side validation (the admin API can bypass weak-password/format checks).
  if (!password || password.length < 8) return json({ error: 'password_too_short' }, 400);
  if (phone && !E164.test(phone)) return json({ error: 'invalid_phone' }, 400);
  if (!full_name || !full_name.trim()) return json({ error: 'full_name_required' }, 400);

  const admin = createClient(url, serviceKey);

  // 1) Attach secondary identifier + password to the existing user.
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    password,
  });
  if (updateErr) return json({ error: updateErr.message }, 400);

  // 2) Read the authoritative identifiers now on the user (server-verified, not client-supplied).
  const { data: fresh, error: fetchErr } = await admin.auth.admin.getUserById(user.id);
  if (fetchErr || !fresh.user) return json({ error: 'user_fetch_failed' }, 400);
  const authEmail = fresh.user.email;
  const authPhone = fresh.user.phone;
  if (!authEmail || !authPhone) return json({ error: 'missing_identifier' }, 400);

  // 3) Create the profile from server-trusted values (service role bypasses RLS).
  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email: authEmail,
      phone: authPhone,
      full_name: full_name.trim().replace(/\s+/g, ' '),
    },
    { onConflict: 'id' },
  );
  if (profileErr) return json({ error: profileErr.message }, 400);

  return json({ ok: true });
});
