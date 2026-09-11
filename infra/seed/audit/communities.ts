// infra/seed/audit/communities.ts
// C1 (A1 owns, Community Pro), C2 (member), C3 (outsider), C4 (request pending), two decoys.
import type { Ctx } from './context.ts';
import { u } from './context.ts';

const create = (ctx: Ctx, key: string, args: Record<string, unknown>) =>
  ctx.c.rpc<string>(u(ctx, key).jwt, 'create_community_with_personal_tenant', {
    p_type: 'club', p_country: 'PT', p_privacy: 'public', p_description: null, p_location: null,
    p_thumbnail_path: null, p_cover_image_path: null, p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
    ...args,
  });

export async function seedCommunities(ctx: Ctx) {
  // C1 — A1 owner. Plan switch baseline: Community Pro.
  ctx.ids.C1 = await create(ctx, 'a1', {
    p_name: 'Lisboa Padel Jam', p_description: 'Weeknight leagues and weekend socials in Lisboa.', p_location: 'Lisboa, PT',
    p_cancellation_rules_enabled: true, p_cancellation_rules_text: 'Cancel at least 12 hours before the event.',
  });
  await ctx.c.insert('community_subscriptions', { community_id: ctx.ids.C1, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  await ctx.c.patch('venues', `id=eq.${ctx.ids.VENUE}`, { community_id: ctx.ids.C1 });
  for (const k of ['f4', 'f5', 'f6', 'f7', 'f8', 'u1a', 'u1b', 'u1c', 'u2', 'u3', 'u6', 'u7',
    'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12', 'c13']) {
    await ctx.c.rpc(u(ctx, k).jwt, 'join_community', { p_community_id: ctx.ids.C1, p_ack: true });
  }
  await ctx.c.patch('community_members', `community_id=eq.${ctx.ids.C1}&user_id=eq.${u(ctx, 'f4').id}`, { role: 'admin' });
  // Invitations sent and not accepted (U4, U5, F2 are not members of C1).
  await ctx.c.rpc(u(ctx, 'a1').jwt, 'invite_to_community', { p_community_id: ctx.ids.C1, p_invitee_ids: [u(ctx, 'u4').id, u(ctx, 'u5').id, u(ctx, 'f2').id], p_group_ids: [] });
  await ctx.c.insert('community_posts', [
    { community_id: ctx.ids.C1, author_id: u(ctx, 'a1').id, kind: 'user', body: 'Tuesday league is back. Sign up in the group! 🎾' },
    { community_id: ctx.ids.C1, author_id: u(ctx, 'f4').id, kind: 'user', body: 'Great games last week, thanks everyone.' },
  ]);

  // C2 — F1 owner, A1 co-admin, only the general group (that group is G2).
  // A1 organizes E4/E5/the audit's E6-adjacent fixtures inside G2 (see the document); create_event
  // requires the caller to be a community admin/owner whenever the event carries a group_id
  // (infra/supabase/migrations/0067_create_event_location.sql, is_community_admin(v_cid)). A plain
  // membership cannot satisfy that, so A1 is promoted to admin here, the same way F4 is in C1 above.
  ctx.ids.C2 = await create(ctx, 'f1', { p_name: 'Padel Porto Social', p_description: 'Casual games in Porto.', p_location: 'Porto, PT' });
  await ctx.c.insert('community_subscriptions', { community_id: ctx.ids.C2, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });
  for (const k of ['a1', 'u1a', 'u1c', 'u2', 'u3', 'u6', 'f5', 'f6', 'f7', 'f8']) {
    await ctx.c.rpc(u(ctx, k).jwt, 'join_community', { p_community_id: ctx.ids.C2, p_ack: true });
  }
  await ctx.c.patch('community_members', `community_id=eq.${ctx.ids.C2}&user_id=eq.${u(ctx, 'a1').id}`, { role: 'admin' });

  // C3 — F2 owner, A1 not a member. Holds U4's ranked history.
  ctx.ids.C3 = await create(ctx, 'f2', { p_name: 'Cascais Padel Club', p_description: 'The club by the sea.', p_location: 'Cascais, PT' });
  await ctx.c.insert('community_subscriptions', { community_id: ctx.ids.C3, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });
  for (const k of ['u4', 'c03', 'c04', 'c05', 'c06']) {
    await ctx.c.rpc(u(ctx, k).jwt, 'join_community', { p_community_id: ctx.ids.C3, p_ack: true });
  }

  // C4 — F3 owner, request to join, A1's request pending.
  ctx.ids.C4 = await create(ctx, 'f3', { p_name: 'Clube Fechado de Sintra', p_privacy: 'request_to_join', p_description: 'Members only.', p_location: 'Sintra, PT' });
  const r = await ctx.c.rpc<string>(u(ctx, 'a1').jwt, 'join_community', { p_community_id: ctx.ids.C4, p_ack: true });
  if (r !== 'requested') throw new Error(`expected C4 join to be 'requested', got ${r}`);

  // Decoys for S4 (similar names). The first invites A1 (N8, community).
  ctx.ids.C_DECOY1 = await create(ctx, 'c01', { p_name: 'Padel Cascais', p_location: 'Cascais, PT' });
  ctx.ids.C_DECOY2 = await create(ctx, 'c02', { p_name: 'Clube Padel Cascais', p_location: 'Cascais, PT' });
  // Starter allows one group; the decoy league group in groups.ts needs Basic.
  await ctx.c.insert('community_subscriptions', { community_id: ctx.ids.C_DECOY1, dimension: 'community', plan_id: 'basic', status: 'active', provider: 'manual' });
  await ctx.c.rpc(u(ctx, 'c01').jwt, 'invite_to_community', { p_community_id: ctx.ids.C_DECOY1, p_invitee_ids: [u(ctx, 'a1').id], p_group_ids: [] });
  ctx.log(`communities C1=${ctx.ids.C1} C2=${ctx.ids.C2} C3=${ctx.ids.C3} C4=${ctx.ids.C4}`);
}
