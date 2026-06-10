// Sets the SECOND identifier (phone if the user started via email, or email if they started via
// phone) plus a password on the existing auth.users row — WITHOUT forcing an immediate confirmation
// round-trip (Padel Jam AU-07: the secondary identifier is verified lazily later). This requires the
// service-role admin API, so it must run server-side in this Edge Function, never from the client.
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

  let body: { phone?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { phone, email, password } = body;

  // Admin update: set the secondary identifier + password on the same user row.
  const admin = createClient(url, serviceKey);
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(password ? { password } : {}),
  });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
