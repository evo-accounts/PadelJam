// Upserts the Stream channel for a group/event and reconciles its members to the current DB
// membership (full add+remove). Authorization + member list come from chat_channel_spec, called
// AS THE CALLER so its SECURITY DEFINER auth check uses the caller's auth.uid().
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { StreamChat } from 'npm:stream-chat';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const key = Deno.env.get('STREAM_API_KEY');
  const secret = Deno.env.get('STREAM_API_SECRET');
  if (!key || !secret) return json({ error: 'stream_not_configured' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });

  let body: { kind?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const kind = body.kind;
  const id = body.id;
  if ((kind !== 'group' && kind !== 'event') || !id) return json({ error: 'bad_request' }, 400);

  // Authorize + fetch the channel spec as the caller.
  const { data: spec, error: specErr } = await userClient.rpc('chat_channel_spec', {
    p_kind: kind,
    p_id: id,
  });
  if (specErr) {
    const m = specErr.message ?? '';
    if (m.includes('forbidden')) return json({ error: 'forbidden' }, 403);
    if (m.includes('no_chat')) return json({ error: 'no_chat' }, 409);
    return json({ error: 'spec_failed' }, 500);
  }
  const row = Array.isArray(spec) ? spec[0] : spec;
  if (!row) return json({ error: 'not_found' }, 404);
  const name: string = row.name;
  const memberIds: string[] = row.member_ids ?? [];

  try {
    const server = StreamChat.getInstance(key, secret);
    const channel = server.channel(kind, id, {
      name,
      created_by_id: user.id,
      members: memberIds,
    });
    await channel.create(); // get-or-create
    await channel.update({ name });

    // Full reconcile.
    const res = await channel.queryMembers({});
    const current = res.members.map((m) => m.user_id).filter((x): x is string => !!x);
    const toAdd = memberIds.filter((x) => !current.includes(x));
    const toRemove = current.filter((x) => !memberIds.includes(x));
    if (toAdd.length) await channel.addMembers(toAdd);
    if (toRemove.length) await channel.removeMembers(toRemove);

    return json({ cid: channel.cid });
  } catch (e) {
    return json({ error: 'stream_failed', detail: String(e) }, 500);
  }
});
