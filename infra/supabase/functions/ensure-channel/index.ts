// Upserts the Stream channel for a group/event and reconciles its members to the current DB
// membership (full add+remove). Authorization + member list come from chat_channel_spec, called
// AS THE CALLER so its SECURITY DEFINER auth check uses the caller's auth.uid().
//
// Why the user upsert before addMembers: Stream rejects addMembers for ids that do not exist as
// Stream users, and a user only comes into existence when a client calls connectUser. A group
// whose members had never opened the app's chat therefore made this function 500 with
// stream_failed (reproduced on the hosted project on 2026-09-12). Before adding, we create the
// missing users server-side as bare `{ id }` records; the client fills in name/image on connect.
// Only MISSING ids are upserted — Stream's upsert is a full overwrite, so re-upserting an
// existing user with `{ id }` alone would blank the name/image their client already set.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { StreamChat } from 'npm:stream-chat';
import { chunk } from '../_shared/chunk.ts';
import { withCors } from '../_shared/cors.ts';

// Stream caps member mutations, user upserts and `$in` user queries at 100 per call.
const STREAM_BATCH = 100;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Creates Stream users for any of `ids` that do not exist yet (see header for why).
async function ensureStreamUsers(server: StreamChat, ids: string[]): Promise<void> {
  for (const batch of chunk(ids, STREAM_BATCH)) {
    const { users } = await server.queryUsers({ id: { $in: batch } }, {}, { limit: STREAM_BATCH });
    const existing = new Set(users.map((u) => u.id));
    const missing = batch.filter((id) => !existing.has(id));
    if (missing.length) await server.upsertUsers(missing.map((id) => ({ id })));
  }
}

Deno.serve(withCors(async (req) => {
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
    });
    await channel.create(); // get-or-create
    await channel.update({ name });

    // Full reconcile. Note: add + remove are two non-atomic Stream calls — if removeMembers
    // throws after addMembers succeeds, the channel is left half-reconciled; lazy
    // reconcile-on-open self-heals on the next open (a trigger→webhook upgrade would fix this).
    // Page through ALL current members (Stream returns max 100 per query).
    const current: string[] = [];
    for (let offset = 0; ; offset += STREAM_BATCH) {
      const page = await channel.queryMembers({}, { created_at: 1 }, { limit: STREAM_BATCH, offset });
      const ids = page.members.map((m) => m.user_id).filter((x): x is string => !!x);
      current.push(...ids);
      if (page.members.length < STREAM_BATCH) break;
    }
    const currentSet = new Set(current);
    const memberSet = new Set(memberIds);
    const toAdd = memberIds.filter((x) => !currentSet.has(x));
    const toRemove = current.filter((x) => !memberSet.has(x));
    // Members who have never connected do not exist in Stream yet; addMembers would reject them.
    await ensureStreamUsers(server, toAdd);
    for (const batch of chunk(toAdd, STREAM_BATCH)) await channel.addMembers(batch);
    for (const batch of chunk(toRemove, STREAM_BATCH)) await channel.removeMembers(batch);

    return json({ cid: channel.cid });
  } catch (e) {
    // Log the detail server-side; don't echo raw Stream errors back to the client.
    console.error('ensure-channel stream error:', e);
    return json({ error: 'stream_failed' }, 500);
  }
}));
