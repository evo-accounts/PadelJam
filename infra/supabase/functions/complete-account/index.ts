// Completes a new account: sets the password (admin API, so the weak-password checks are enforced
// server-side), validates the display name, and creates the profiles row SERVER-SIDE from the
// identifiers actually persisted on auth.users. Doing profile creation here (not on the client)
// prevents a client from inserting a profile with an email/phone that isn't theirs (profiles is
// globally readable).
//
// The SECONDARY identifier (phone if the user started via email, or email if via phone) is NOT
// attached here (M12 superseded the AU-07 "lazy" attach): the client verifies it as the signed-in
// user via GoTrue's native change flows (updateUser -> verifyOtp type email_change/phone_change),
// and the sync_profile_contact trigger (migration 0058) lands the verified value on the profile.
// The body still carries the secondary so we can 409 early on an identifier owned by another
// profile — pure UX (fast feedback before an OTP is sent); ownership is enforced by verification.
// Requires the service-role key, so this must run server-side only.
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

  // Refuse identifiers already owned by ANOTHER profile. Verification (the OTP round-trip the
  // client runs after this call) is what enforces ownership; this pre-check only surfaces the
  // conflict before a code is sent — better UX and no SMS spent on a doomed attempt.
  if (email) {
    const { count, error: emailCheckErr } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .ilike('email', email.replaceAll('%', '\\%').replaceAll('_', '\\_'))
      .neq('id', user.id);
    if (emailCheckErr) return json({ error: 'identifier_check_failed' }, 500);
    if ((count ?? 0) > 0) return json({ error: 'email_taken' }, 409);
  }
  if (phone) {
    // profiles.phone holds GoTrue's format (no leading '+', copied from auth.users), while the
    // client sends E164 — match both so the check isn't defeated by the representation.
    const { count, error: phoneCheckErr } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('phone', [phone, phone.replace(/^\+/, '')])
      .neq('id', user.id);
    if (phoneCheckErr) return json({ error: 'identifier_check_failed' }, 500);
    if ((count ?? 0) > 0) return json({ error: 'phone_taken' }, 409);
  }

  // 1) Set the password on the existing user. The secondary identifier is deliberately NOT
  //    attached — it reaches auth.users only through the client's verified change flow.
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { password });
  if (updateErr) return json({ error: updateErr.message }, 400);

  // 2) Read the authoritative identifiers now on the user (server-verified, not client-supplied).
  const { data: fresh, error: fetchErr } = await admin.auth.admin.getUserById(user.id);
  if (fetchErr || !fresh.user) return json({ error: 'user_fetch_failed' }, 400);
  const authEmail = fresh.user.email;
  const authPhone = fresh.user.phone;
  // The verified PRIMARY identifier must exist; the secondary may still be pending verification.
  if (!authEmail && !authPhone) return json({ error: 'missing_identifier' }, 400);

  // 3) Create the profile from server-trusted values (service role bypasses RLS). The missing
  //    secondary stays NULL until sync_profile_contact copies it over post-verification.
  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: user.id,
      // `|| null` (not ??): GoTrue reports a missing phone as "" — an empty string would
      // collide on the UNIQUE constraint as soon as a second user skips the same secondary.
      email: authEmail || null,
      phone: authPhone || null,
      full_name: full_name.trim().replace(/\s+/g, ' '),
    },
    { onConflict: 'id' },
  );
  if (profileErr) return json({ error: profileErr.message }, 400);

  return json({ ok: true });
});
