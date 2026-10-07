// Mints a Stream Chat user token for the authenticated Supabase user. A Stream token is an
// HS256 JWT with a `user_id` claim, signed with the Stream API SECRET (server-side only).
// The client sets the user's name/image on connectUser, so we only mint the token here.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { create } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';
import { withCors } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Exported for the (deferred) unit test; pure given (userId, secret).
export async function mintStreamToken(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return await create({ alg: 'HS256', typ: 'JWT' }, { user_id: userId }, key);
}

Deno.serve(withCors(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const secret = Deno.env.get('STREAM_API_SECRET');
  if (!secret) return json({ error: 'stream_not_configured' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  const token = await mintStreamToken(user.id, secret);
  return json({ token, userId: user.id });
}));
