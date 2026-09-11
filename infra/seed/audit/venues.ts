// infra/seed/audit/venues.ts
// Library venue (E1 picks it, with courts) plus decoys so the venue search has several results.
import type { Ctx } from './context.ts';

export async function seedVenues(ctx: Ctx) {
  // Venues have no user write policy; the service role owns them. Community set later (C1).
  const [arena] = await ctx.c.insert<{ id: string }[]>('venues', {
    name: 'Lisboa Padel Arena', address: 'Av. da Liberdade 100, Lisboa', created_by: ctx.users.a1.id, rating: 4.5,
  });
  const courts = await ctx.c.insert<{ id: string }[]>('courts', [1, 2, 3].map((n) => ({ venue_id: arena.id, name: `Court ${n}`, sort_order: n })));
  ctx.ids.VENUE = arena.id;
  ctx.ids.COURT1 = courts[0].id;
  ctx.ids.COURT2 = courts[1].id;
  await ctx.c.insert('venues', [
    { name: 'Padel Porto Center', address: 'Rua de Cedofeita 200, Porto', created_by: ctx.users.f1.id, rating: 4.1 },
    { name: 'Cascais Padel Club Courts', address: 'Av. Marginal 1, Cascais', created_by: ctx.users.f2.id, rating: 4.7 },
  ]);
  ctx.log(`venue ${arena.id} with 3 courts`);
}
