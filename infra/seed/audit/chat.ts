// infra/seed/audit/chat.ts
// Group channels via ensure-channel (as A1), messages via per-user Stream tokens from
// stream-token. No Stream secret. Skipped, with a reason, when the key or the functions are absent.
import { StreamChat } from 'stream-chat';
import type { Ctx } from './context.ts';
import { u, id } from './context.ts';

async function connect(ctx: Ctx, key: string): Promise<StreamChat> {
  const s = u(ctx, key);
  const { token } = await ctx.c.invokeFn<{ token: string }>('stream-token', s.jwt);
  const client = new StreamChat(ctx.c.env.streamKey!, { timeout: 15000 });
  await client.connectUser({ id: s.id, name: s.person.name }, token);
  return client;
}

export async function seedChat(ctx: Ctx): Promise<{ skipped: string | null }> {
  if (!ctx.c.env.streamKey) return { skipped: 'EXPO_PUBLIC_STREAM_API_KEY not set' };
  const a1 = u(ctx, 'a1');
  const cids: Record<string, string> = {};
  try {
    for (const g of ['G1', 'G2', 'G3'] as const) {
      const { cid } = await ctx.c.invokeFn<{ cid: string }>('ensure-channel', a1.jwt, { kind: 'group', id: id(ctx, g) });
      cids[g] = cid;
    }
  } catch (e) {
    return { skipped: `ensure-channel unavailable: ${(e as Error).message.slice(0, 120)}` };
  }

  const say = async (key: string, cid: string, texts: string[]) => {
    const client = await connect(ctx, key);
    const [type, chanId] = cid.split(':');
    const ch = client.channel(type, chanId);
    await ch.watch();
    for (const text of texts) await ch.sendMessage({ text });
    await client.disconnectUser();
  };

  // CH1: one chat per group. Seed a little history in each.
  await say('f4', cids.G1, ['Courts booked for Tuesday, 19:00.', 'Bring your own balls this week.']);
  await say('f5', cids.G1, ['On it 👍']);
  await say('f1', cids.G2, ['Welcome to the Porto group!']);
  await say('u1a', cids.G3, ['Private group is live.']);

  // A1 reads G2, so G1 and G3 stay unread (CH2 = two badges).
  {
    const client = await connect(ctx, 'a1');
    const [type, chanId] = cids.G2.split(':');
    const ch = client.channel(type, chanId);
    await ch.watch();
    await ch.markRead();
    // CH3: direct conversation with U4, with messages.
    const dm = client.channel('messaging', { members: [a1.id, u(ctx, 'u4').id] });
    await dm.watch();
    await dm.sendMessage({ text: 'Hey Diogo, up for a game on Saturday?' });
    // CH4: direct conversation with no messages at all.
    const empty = client.channel('messaging', { members: [a1.id, u(ctx, 'c09').id] });
    await empty.watch();
    if (!dm.cid) throw new Error('Stream did not return a cid for the direct channel');
    if (!empty.cid) throw new Error('Stream did not return a cid for the direct channel');
    ctx.ids.CH3 = dm.cid;
    ctx.ids.CH4 = empty.cid;
    await client.disconnectUser();
  }
  {
    const client = await connect(ctx, 'u4');
    const dm = client.channel('messaging', { members: [a1.id, u(ctx, 'u4').id] });
    await dm.watch();
    await dm.sendMessage({ text: 'Saturday works. 10:00 at Cascais?' });
    await dm.sendMessage({ text: 'I can bring a fourth.' });
    await client.disconnectUser();
  }
  // Unread in G1 and G3 must post AFTER A1's read of G2 to be safe from ordering; they never touched G1/G3 anyway.
  await say('f6', cids.G1, ['Who is bringing the speaker?']);
  await say('u6', cids.G3, ['Thursday works for me.']);

  ctx.ids.CH_G1 = cids.G1; ctx.ids.CH_G2 = cids.G2; ctx.ids.CH_G3 = cids.G3;
  ctx.log(`chat: group channels ${Object.values(cids).length}, DM with U4, empty DM with C09`);
  return { skipped: null };
}
