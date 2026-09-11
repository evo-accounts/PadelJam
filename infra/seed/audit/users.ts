// infra/seed/audit/users.ts
// Auth users, profiles, avatars, A1's Jammer+ row, the block, and the follow graph.
import { ALL, NAMED, PASSWORD, type Person } from './cast.ts';
import { colourFor, solidPng } from './png.ts';
import { u } from './context.ts';
import type { Ctx } from './context.ts';

const COURT_SIDE = ['left', 'right'] as const;
const TIME = ['any', 'morning', 'afternoon', 'night'] as const;

/** Dominant hand / court side / preferred time: explicit fields on the person win, otherwise
 * fall back to the index-based rules used to spread traits across the crowd. */
function traitsFor(p: Person, i: number) {
  return {
    dominant_hand: p.hand ?? (i % 5 === 0 ? 'left' : 'right'),
    court_side: p.side ?? COURT_SIDE[i % 2],
    preferred_time: p.time ?? TIME[i % 4],
  };
}

export async function seedUsers(ctx: Ctx) {
  for (const [i, p] of ALL.entries()) {
    const id = await ctx.c.adminCreateUser(p.email, p.phone, PASSWORD);
    let avatar_url: string | null = null;
    if (p.avatar) {
      const path = `${id}/audit.png`;
      await ctx.c.uploadObject('avatars', path, solidPng(128, 128, colourFor(p.key)), 'image/png');
      avatar_url = path;
    }
    const { dominant_hand, court_side, preferred_time } = traitsFor(p, i);
    await ctx.c.insert('profiles', {
      id, email: p.email, phone: p.phone, full_name: p.name, locale: 'en',
      onboarded_at: new Date().toISOString(), gender: p.gender,
      dominant_hand, court_side, preferred_time,
      description: p.bio === null ? null : p.bio ?? `${p.name.split(' ')[0]} plays padel in ${p.location.split(',')[0]}.`,
      location_text: p.location, avatar_url,
    });
    ctx.users[p.key] = { id, jwt: await ctx.c.signIn(p.email, PASSWORD), person: p };
    ctx.log(`user ${p.key} ${p.email}`);
  }

  // Jammer+ baseline for A1 (the in-app switch, shipped separately, toggles this row).
  await ctx.c.insert('subscriptions', {
    user_id: u(ctx, 'a1').id, dimension: 'account', plan_id: 'jammer_plus', status: 'active', provider: 'manual',
  });

  // Blocked user. Inserted directly: block_user would also strip follows, and there are none yet.
  await ctx.c.insert('blocks', { blocker_id: u(ctx, 'a1').id, blocked_id: u(ctx, 'u7').id });

  // Follows: asymmetric in both directions, U7 excluded (blocked). Every insert fires the
  // 'follow' trigger for A1; notifications.ts prunes the list afterwards.
  const named = NAMED.filter((p) => p.key !== 'u7');
  const a1Follows = named.filter((p) => !['u3', 'u5'].includes(p.key));           // 14
  const followA1 = named.filter((p) => !['u2', 'u5', 'u6'].includes(p.key));      // 13
  await ctx.c.insert('follows', [
    ...a1Follows.map((p) => ({ follower_id: u(ctx, 'a1').id, followee_id: u(ctx, p.key).id })),
    ...followA1.map((p) => ({ follower_id: u(ctx, p.key).id, followee_id: u(ctx, 'a1').id })),
    // U4 has a populated profile: a few followers of their own.
    ...['f2', 'f5', 'c03'].map((k) => ({ follower_id: u(ctx, k).id, followee_id: u(ctx, 'u4').id })),
  ]);
  ctx.log(`follows: A1 → ${a1Follows.length}, → A1 ${followA1.length}`);
}
