// infra/seed/audit/events.ts
// E1..E9 from the audit document, the cancelled and date-changed extras, and U4's history.
// Pattern (proven in seed-e2e.mjs): create in the future through the RPCs, populate, then
// back-date with the service role. Auto-invitations are removed where a member must arrive
// without one.
import type { Ctx } from './context.ts';
import { u, id, daysFromNow, hoursFromNow } from './context.ts';
import { americanoRounds, confirmedIds, scoreRound } from './rounds.ts';

const base = (groupId: string | null, over: Record<string, unknown>) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: 'Event', venue_id: null,
  manual_location_name: 'Lisboa Padel Arena', manual_location_address: 'Av. da Liberdade 100', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: daysFromNow(3), duration_minutes: 90, allow_standby: true, standby_spots: 2,
  is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});

const create = (ctx: Ctx, key: string, payload: Record<string, unknown>) =>
  ctx.c.rpc<string>(u(ctx, key).jwt, 'create_event', { p_payload: payload });
const join = (ctx: Ctx, key: string, eventId: string) => ctx.c.rpc<string>(u(ctx, key).jwt, 'join_event', { p_event_id: eventId });
const dropInvitation = (ctx: Ctx, eventId: string, userId: string) =>
  ctx.c.del('event_invitations', `event_id=eq.${eventId}&invitee_id=eq.${userId}`);
const backdate = (ctx: Ctx, eventId: string, startsAt: string) => ctx.c.patch('events', `id=eq.${eventId}`, { starts_at: startsAt });

export async function seedEvents(ctx: Ctx) {
  const a1 = u(ctx, 'a1');

  // E9 — completed 10 days ago, organizer only, finished early with a not-played match.
  {
    const eventId = await create(ctx, 'a1', base(id(ctx, 'G1'), { name: 'Terça #11', starts_at: hoursFromNow(8), allow_standby: false, standby_spots: null }));
    for (const k of ['f4', 'f5', 'u6', 'u1a']) await join(ctx, k, eventId);
    const ids = await confirmedIds(ctx, eventId);
    await ctx.c.rpc(a1.jwt, 'start_event', { p_event_id: eventId, p_rounds: americanoRounds(ids, 1) });
    await scoreRound(ctx, a1.jwt, eventId, 1, [[24, 12]]);
    await scoreRound(ctx, a1.jwt, eventId, 2, ['not_played']);
    // round 3 stays pending → finished_early
    await ctx.c.rpc(a1.jwt, 'finish_event', { p_event_id: eventId, p_finish_message: 'Rain stopped play. Counted anyway.', p_counts_override: true });
    await backdate(ctx, eventId, daysFromNow(-10, 19));
    ctx.ids.E9 = eventId;
    ctx.log(`E9 ${eventId}`);
  }

  // E1 — completed 3 days ago, organizing and playing, library venue with courts, results posted.
  {
    const eventId = await create(ctx, 'a1', base(id(ctx, 'G1'), {
      name: 'Terça #12', organizer_role: 'organizing_and_playing', num_courts: 2, starts_at: hoursFromNow(8),
      venue_id: id(ctx, 'VENUE'), manual_location_name: null, manual_location_address: null, court_ids: [id(ctx, 'COURT1'), id(ctx, 'COURT2')],
      allow_standby: false, standby_spots: null,
    }));
    for (const k of ['f4', 'f5', 'u1a', 'u6', 'f6', 'f7', 'u2']) await join(ctx, k, eventId);
    const ids = await confirmedIds(ctx, eventId);
    await ctx.c.rpc(a1.jwt, 'start_event', { p_event_id: eventId, p_rounds: americanoRounds(ids, 2) });
    for (let r = 1; r <= 7; r++) await scoreRound(ctx, a1.jwt, eventId, r, [[24, 15], [21, 19]]);
    await ctx.c.rpc(a1.jwt, 'finish_event', { p_event_id: eventId, p_finish_message: 'Great night. See you next Tuesday.', p_counts_override: true });
    await ctx.c.rpc(a1.jwt, 'post_event_result', { p_event_id: eventId });
    await backdate(ctx, eventId, daysFromNow(-3, 19));
    ctx.ids.E1 = eventId;
    ctx.log(`E1 ${eventId}`);
  }

  // Ranking tie in G1: make F5's total equal to F4's by patching one row (states, not scores).
  {
    const rows = await ctx.c.sel<{ user_id: string; ranking_points: number; event_id: string }[]>(
      'group_event_results', `event_id=in.(${id(ctx, 'E1')},${id(ctx, 'E9')})&select=user_id,ranking_points,event_id`);
    const total = (k: string) => rows.filter((r) => r.user_id === u(ctx, k).id).reduce((s, r) => s + r.ranking_points, 0);
    const diff = total('f4') - total('f5');
    if (diff !== 0) {
      const target = rows.find((r) => r.user_id === u(ctx, 'f5').id && r.event_id === id(ctx, 'E1'))!;
      await ctx.c.patch('group_event_results', `event_id=eq.${id(ctx, 'E1')}&user_id=eq.${u(ctx, 'f5').id}`, { ranking_points: target.ranking_points + diff });
    }
    ctx.log(`ranking tie F4/F5 at ${total('f4')} points`);
  }

  // E2 — live mexicano, mixed, time, recurring, fee partly paid, full + waiting list, timer, round 2 pending, blast.
  {
    const eventId = await create(ctx, 'a1', base(id(ctx, 'G1'), {
      name: 'Mexicano Misto de Quinta', event_type: 'mexicano', specification: 'mixed', scoring_mode: 'time', scoring_value: 12,
      organizer_role: 'organizing_and_playing', starts_at: hoursFromNow(8), players_submit_results: true,
      entrance_fee_enabled: true, entrance_fee_amount: 5, entrance_fee_method: 'mba', entrance_fee_mba_number: '910000100',
      manual_location_name: 'Campo do Bairro', manual_location_address: 'Rua das Flores 12, Lisboa',
      series: { day_of_week: 4, start_time: '19:00', duration_minutes: 90, invite_lead_days: 5 },
    }));
    for (const k of ['f5', 'u6', 'f6', 'f7', 'f8']) await join(ctx, k, eventId);      // 6 confirmed with A1 (3 men, 3 women)
    for (const k of ['u1a', 'u1c']) {
      await dropInvitation(ctx, eventId, u(ctx, k).id);
      const s = await join(ctx, k, eventId);
      if (s !== 'waiting_list') throw new Error(`E2: expected ${k} on the waiting list, got ${s}`);
    }
    const parts = await ctx.c.sel<{ id: string; user_id: string }[]>('event_participants', `event_id=eq.${eventId}&status=eq.confirmed&select=id,user_id`);
    for (const k of ['a1', 'f5', 'f6']) {
      const row = parts.find((p) => p.user_id === u(ctx, k).id)!;
      await ctx.c.rpc(a1.jwt, 'mark_paid', { p_participant_id: row.id, p_paid: true });
    }
    ctx.ids.E2_NEXT = await ctx.c.rpc<string>(a1.jwt, 'materialize_occurrence', { p_after_event_id: eventId });
    await ctx.c.rpc(a1.jwt, 'start_event', { p_event_id: eventId });
    await scoreRound(ctx, a1.jwt, eventId, 1);
    await ctx.c.rpc(a1.jwt, 'generate_next_round', { p_event_id: eventId });
    await ctx.c.rpc(a1.jwt, 'set_event_timer', { p_event_id: eventId, p_action: 'start' });
    // Blast recorded, never dispatched: no email leaves the seed.
    await ctx.c.insert('event_blasts', {
      event_id: eventId, sender_id: a1.id, source_template_id: null, title: 'Round 2 starting',
      description: 'Grab water, round 2 is up on the board.', image_path: null, channels: ['email'], send_to: 'all_members', sent_to_count: 5,
    });
    await backdate(ctx, eventId, hoursFromNow(-2));
    ctx.ids.E2 = eventId;
    ctx.log(`E2 ${eventId} (next occurrence ${id(ctx, 'E2_NEXT')})`);
  }

  // E3 — live Up & Down, team, classic sets, private, G3, organizing only, no location.
  {
    const eventId = await create(ctx, 'a1', base(id(ctx, 'G3'), {
      name: 'Sobe e Desce', event_type: 'up_and_down', specification: 'team', scoring_mode: 'classic', scoring_value: null,
      is_private: true, has_location: false, manual_location_name: null, manual_location_address: null, starts_at: hoursFromNow(8),
      allow_standby: false, standby_spots: null,
      invitees: ['u1a', 'u1c', 'u6', 'f5'].map((k) => ({ invitee_id: u(ctx, k).id, name: null, email: null, phone: null })),
    }));
    await ctx.c.rpc(u(ctx, 'u1a').jwt, 'choose_partner', { p_event_id: eventId, p_partner_user: u(ctx, 'u1c').id });
    await ctx.c.rpc(u(ctx, 'u6').jwt, 'choose_partner', { p_event_id: eventId, p_partner_user: u(ctx, 'f5').id });
    await ctx.c.rpc(a1.jwt, 'start_event', { p_event_id: eventId });
    await backdate(ctx, eventId, hoursFromNow(-1));
    ctx.ids.E3 = eventId;
    ctx.log(`E3 ${eventId}`);
  }

  // E4 — scheduled, zero confirmed, no location, no courts, fee on → pending actions rows.
  // A1 can only organize inside groups of C1 (create_event requires community admin).
  ctx.ids.E4 = await create(ctx, 'a1', base(id(ctx, 'G1'), {
    name: 'Sábado Aberto', starts_at: daysFromNow(5, 10), has_location: false, manual_location_name: null, manual_location_address: null,
    entrance_fee_enabled: true, entrance_fee_amount: 4, entrance_fee_method: 'cash',
  }));
  ctx.log(`E4 ${id(ctx, 'E4')}`);

  // E5 — scheduled mixed, 4 men + 3 women on 2 courts → start blocked by the mixed rule.
  // A1 can only organize inside groups of C1 (create_event requires community admin).
  {
    const eventId = await create(ctx, 'a1', base(id(ctx, 'G1'), { name: 'Misto de Domingo', specification: 'mixed', num_courts: 2, starts_at: daysFromNow(6, 11) }));
    for (const k of ['u1a', 'u1c', 'u6', 'f5', 'f6', 'f7', 'f8']) await join(ctx, k, eventId);
    ctx.ids.E5 = eventId;
    ctx.log(`E5 ${eventId}`);
  }

  // E6 — scheduled mixed, full, A1 first on the waiting list. F1 organizes (acting user).
  {
    const eventId = await create(ctx, 'f1', base(id(ctx, 'G2'), { name: 'Misto Cheio', specification: 'mixed', starts_at: daysFromNow(4, 18), allow_standby: false, standby_spots: null }));
    for (const k of ['u6', 'f5', 'f6', 'f7']) await join(ctx, k, eventId);
    for (const k of ['a1', 'u2']) {
      await dropInvitation(ctx, eventId, u(ctx, k).id);
      const s = await join(ctx, k, eventId);
      if (s !== 'waiting_list') throw new Error(`E6: expected ${k} on the waiting list, got ${s}`);
    }
    ctx.ids.E6 = eventId;
    ctx.log(`E6 ${eventId}`);
  }

  // The extras come before E7/E8 on purpose: notifications.ts keeps the newest two rows per
  // type, and the audit needs E7's (N1) and E8's (N2) invitations to be the ones that survive.

  // Extra — date-changed event A1 is confirmed in (N6). update_event notifies confirmed players
  // only, so this cannot ride on E8, where A1 must stay merely invited.
  {
    const payload = base(id(ctx, 'G1'), { name: 'Treino Remarcado', starts_at: daysFromNow(11, 19) });
    const eventId = await create(ctx, 'f4', payload);
    await ctx.c.rpc(a1.jwt, 'accept_event_invitation', { p_event_id: eventId });
    await ctx.c.rpc(u(ctx, 'f4').jwt, 'update_event', { p_event_id: eventId, p_payload: { ...payload, starts_at: daysFromNow(12, 19) } });
    ctx.ids.E_UPDATED = eventId;
    ctx.log(`E date-changed ${eventId}`);
  }

  // Extra — cancelled event A1 was confirmed in (N5).
  {
    const eventId = await create(ctx, 'f4', base(id(ctx, 'G1'), { name: 'Treino Cancelado', starts_at: daysFromNow(10, 19) }));
    await ctx.c.rpc(a1.jwt, 'accept_event_invitation', { p_event_id: eventId });
    await ctx.c.rpc(u(ctx, 'f4').jwt, 'cancel_event', { p_event_id: eventId, p_scope: 'only_this' });
    ctx.ids.E_CANCELLED = eventId;
    ctx.log(`E cancelled ${eventId}`);
  }

  // E7 — private standalone team event with a fee. A1 invited by name, interested, no partner; F7 asks A1.
  {
    const eventId = await create(ctx, 'f3', base(null, {
      name: 'Duplas de Sintra', specification: 'team', is_private: true, starts_at: daysFromNow(7, 17),
      entrance_fee_enabled: true, entrance_fee_amount: 8, entrance_fee_method: 'at_club',
      manual_location_name: 'Sintra Padel', manual_location_address: 'Rua da Serra 3, Sintra',
      invitees: ['a1', 'u6', 'f5', 'f6', 'f7'].map((k) => ({ invitee_id: u(ctx, k).id, name: null, email: null, phone: null })),
    }));
    await ctx.c.rpc(a1.jwt, 'accept_event_invitation', { p_event_id: eventId });               // interested
    await ctx.c.rpc(u(ctx, 'f7').jwt, 'request_partner', { p_event_id: eventId, p_targets: [a1.id] });   // N10
    await ctx.c.rpc(u(ctx, 'f5').jwt, 'choose_partner', { p_event_id: eventId, p_partner_user: u(ctx, 'f6').id }); // one confirmed pair
    ctx.ids.E7 = eventId;
    ctx.log(`E7 ${eventId}`);
  }

  // E8 — scheduled, A1 invited and unanswered (N2).
  ctx.ids.E8 = await create(ctx, 'f4', base(id(ctx, 'G1'), { name: 'Americano de Sexta', starts_at: daysFromNow(8, 20) }));
  ctx.log(`E8 ${id(ctx, 'E8')}`);

  // U4's history — 20 completed, counted, spread over the last four months, in C3's ranking group.
  for (let i = 0; i < 20; i++) {
    const eventId = await create(ctx, 'f2', base(id(ctx, 'G_C3'), {
      name: `Ranking Cascais #${i + 1}`, event_type: 'mexicano', starts_at: hoursFromNow(8), allow_standby: false, standby_spots: null,
      manual_location_name: 'Cascais Padel Club Courts', manual_location_address: 'Av. Marginal 1',
    }));
    for (const k of ['u4', 'c03', 'c04', 'c05']) await join(ctx, k, eventId);
    await ctx.c.rpc(u(ctx, 'f2').jwt, 'start_event', { p_event_id: eventId });
    await scoreRound(ctx, u(ctx, 'f2').jwt, eventId, 1, [i % 3 === 0 ? [18, 24] : [24, 18]]);
    await ctx.c.rpc(u(ctx, 'f2').jwt, 'finish_event', { p_event_id: eventId, p_finish_message: null, p_counts_override: true });
    await backdate(ctx, eventId, daysFromNow(-(120 - i * 6), 18));
  }
  ctx.log('U4 history: 20 completed events');

  // Explore: an event with a similar name to E8 in another community (S4).
  await create(ctx, 'c01', base((await ctx.c.sel<{ id: string }[]>('groups', `community_id=eq.${id(ctx, 'C_DECOY1')}&is_general=eq.true&select=id`))[0].id, {
    name: 'Americano de Sexta Cascais', starts_at: daysFromNow(8, 20),
  }));
}
