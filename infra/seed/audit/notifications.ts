// infra/seed/audit/notifications.ts
// The emitters already fired while the fixtures were built. This module plants N4 (E6's
// transition is audited live), prunes A1's list to at most two rows per type, and mixes read and
// unread.
import type { Ctx } from './context.ts';
import { u, id } from './context.ts';

export async function seedNotifications(ctx: Ctx) {
  const a1 = u(ctx, 'a1');

  // N4 — the offer for the E6 spot, as notify_waitlist_spot would write it.
  const [me] = await ctx.c.sel<{ id: string }[]>('event_participants', `event_id=eq.${id(ctx, 'E6')}&user_id=eq.${a1.id}&select=id`);
  await ctx.c.insert('notifications', {
    user_id: a1.id, type: 'waitlist_spot', actor_id: u(ctx, 'f1').id, event_id: id(ctx, 'E6'), ref_id: me.id,
    actor_name: u(ctx, 'f1').person.name, entity_name: 'Misto Cheio',
  });

  // Prune: newest two per type.
  const rows = await ctx.c.sel<{ id: string; type: string; created_at: string }[]>(
    'notifications', `user_id=eq.${a1.id}&select=id,type,created_at&order=created_at.desc,id.desc`);
  const seen = new Map<string, number>();
  const drop = new Set<string>();
  for (const r of rows) {
    const n = (seen.get(r.type) ?? 0) + 1;
    seen.set(r.type, n);
    if (n > 2) drop.add(r.id);
  }
  if (drop.size) await ctx.c.del('notifications', `id=in.(${[...drop].join(',')})`);

  // Read/unread mix: every other remaining row is read.
  const keep = rows.filter((r) => !drop.has(r.id));
  const read = keep.filter((_, i) => i % 2 === 1).map((r) => r.id);
  if (read.length) await ctx.c.patch('notifications', `id=in.(${read.join(',')})`, { read_at: new Date().toISOString() });

  const types = [...seen.keys()].sort();
  ctx.log(`notifications for A1: ${keep.length} rows, ${read.length} read, types: ${types.join(', ')}`);
  const expected = ['event_invite', 'event_cancelled', 'event_updated', 'group_invite', 'community_invite', 'follow', 'participant_confirmed', 'waitlist_spot', 'results_published'];
  const missing = expected.filter((t) => !seen.has(t));
  if (missing.length) throw new Error(`A1 is missing notification types: ${missing.join(', ')}`);
}
