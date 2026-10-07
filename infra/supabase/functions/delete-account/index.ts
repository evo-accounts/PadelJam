// Soft-deletes the caller's account. A hard delete is not possible (NOT NULL RESTRICT FKs from owned
// communities/events), so soft_delete_account(p_user) anonymizes the profile, drops the user's own
// memberships and social rows, frees the auth identifiers AND bans the auth user, all in one
// transaction (migration 0143). Blocks other people placed on the account are theirs and stay.
//
// WHO MAY DELETE WHOM. The caller is resolved from their own JWT: auth.getUser() asks GoTrue, so a
// forged, expired or signed-out token is a 401 here. The deletion then runs with the SERVICE key for
// that verified id and no other. soft_delete_account(p_user) is executable by service_role only, and
// 0144 takes the old zero-argument soft_delete_account() away from signed-in users, so nobody can
// reach the deletion over PostgREST, for themselves or anyone else. Before 0143 a user could call the
// zero-argument version directly, skip the ban below, and erase the blocks other people had placed
// on them.
//
// DEPLOY: hosted 0143 must be pasted before this is deployed (or the RPC answers PGRST202 and every
// deletion fails), and 0144 only after — 0144's header has the gate.
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

  const admin = createClient(url, serviceKey);

  // 1) Anonymize, drop the user's data and ban, atomically, for the VERIFIED id. The RPC's own
  //    message is returned as before: the apps look for 'last_admin_must_promote_first' (0098's
  //    sole-admin guard) in it. When the guard refuses, the whole call rolls back, ban included.
  const { error: rpcErr } = await admin.rpc('soft_delete_account', { p_user: user.id });
  if (rpcErr) return json({ error: rpcErr.message }, 400);

  // 2) GoTrue's own ban (~100 years). soft_delete_account already set the same banned_until in the
  //    transaction that deleted the account, so this repeats it through GoTrue's API, belt and braces.
  //    A failure here is logged, not returned: the account IS deleted and banned at this point, and a
  //    400 would keep the client on the delete screen, signed in to an account that no longer exists,
  //    asking the user to retry something that already succeeded.
  const { error: banErr } = await admin.auth.admin.updateUserById(user.id, { ban_duration: '876000h' });
  if (banErr) console.error(`delete-account: GoTrue ban for ${user.id} failed after the SQL ban: ${banErr.message}`);

  return json({ ok: true });
});
