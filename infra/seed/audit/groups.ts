// infra/seed/audit/groups.ts
// G1 public (~30 members, two managers), G2 = C2's general group, G3 private (A1 sole admin),
// G4 archived, G5 private with a pending invitation to A1, plus U4's ranking group in C3.
import type { Ctx } from './context.ts';
import { u } from './context.ts';

const createGroup = (ctx: Ctx, key: string, communityId: string, name: string, isPrivate: boolean, description: string | null) =>
  ctx.c.rpc<string>(u(ctx, key).jwt, 'create_group', {
    p_community_id: communityId, p_name: name, p_description: description, p_is_private: isPrivate, p_thumbnail_path: null,
  });

export async function seedGroups(ctx: Ctx) {
  ctx.ids.G1 = await createGroup(ctx, 'a1', ctx.ids.C1, 'Liga de Terça', false, 'Weekly competitive americano. Ranking counts.');
  for (const k of ['f4', 'f5', 'f6', 'f7', 'f8', 'u1a', 'u1b', 'u1c', 'u2', 'u3', 'u6', 'u7',
    'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12', 'c13']) {
    await ctx.c.rpc(u(ctx, k).jwt, 'join_group', { p_group_id: ctx.ids.G1 });
  }

  const [g2] = await ctx.c.sel<{ id: string }[]>('groups', `community_id=eq.${ctx.ids.C2}&is_general=eq.true&select=id`);
  ctx.ids.G2 = g2.id;

  // G3 — private, in C1. F4 (community admin) is NOT a member, so A1 is the sole admin.
  ctx.ids.G3 = await createGroup(ctx, 'a1', ctx.ids.C1, 'Núcleo Privado', true, 'Invite only.');
  for (const k of ['u1a', 'u1c', 'u6', 'f5']) {
    await ctx.c.rpc(u(ctx, 'a1').jwt, 'invite_to_group', { p_group_id: ctx.ids.G3, p_invitee_id: u(ctx, k).id });
    await ctx.c.rpc(u(ctx, k).jwt, 'accept_group_invitation', { p_group_id: ctx.ids.G3 });
  }

  // G4 — archived.
  ctx.ids.G4 = await createGroup(ctx, 'a1', ctx.ids.C1, 'Torneio de Verão 2025', false, 'Finished. Kept for the history.');
  await ctx.c.rpc(u(ctx, 'a1').jwt, 'archive_group', { p_group_id: ctx.ids.G4 });

  // G5 — private group in C2 that invited A1; A1 has not answered (N8, group).
  ctx.ids.G5 = await createGroup(ctx, 'f1', ctx.ids.C2, 'Porto Elite', true, 'By invitation.');
  await ctx.c.rpc(u(ctx, 'f1').jwt, 'invite_to_group', { p_group_id: ctx.ids.G5, p_invitee_id: u(ctx, 'a1').id });

  // U4's ranking group in C3.
  ctx.ids.G_C3 = await createGroup(ctx, 'f2', ctx.ids.C3, 'Ranking Cascais', false, 'Season ranking.');
  for (const k of ['u4', 'c03', 'c04', 'c05', 'c06']) await ctx.c.rpc(u(ctx, k).jwt, 'join_group', { p_group_id: ctx.ids.G_C3 });

  // Similar names for S4 (groups tab).
  await createGroup(ctx, 'c01', ctx.ids.C_DECOY1, 'Liga de Terça Cascais', false, null);
  ctx.log(`groups G1=${ctx.ids.G1} G2=${ctx.ids.G2} G3=${ctx.ids.G3} G4=${ctx.ids.G4} G5=${ctx.ids.G5}`);
}
