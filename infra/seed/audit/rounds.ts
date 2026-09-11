// infra/seed/audit/rounds.ts
// Scoring helpers and the Americano schedule the app builds client-side before start_event.
import { americanoSchedule } from '../../../packages/api/src/round-gen/americano.ts';
import type { Ctx } from './context.ts';

export function americanoRounds(participantIds: string[], numCourts: number) {
  return americanoSchedule(participantIds, numCourts).map((round) => ({
    round_number: round.roundNumber,
    status: 'pending',
    rests: round.rests,
    matches: round.matches.map((m) => ({ court_number: m.courtNumber, match_number: m.matchNumber, side_a: m.sideA, side_b: m.sideB })),
  }));
}

export async function confirmedIds(ctx: Ctx, eventId: string): Promise<string[]> {
  const rows = await ctx.c.sel<{ id: string; joined_at: string }[]>(
    'event_participants', `event_id=eq.${eventId}&status=eq.confirmed&select=id,joined_at&order=joined_at.asc`);
  return rows.map((r) => r.id);
}

/** Score every pending match of the given round number. `scores[i]` overrides the i-th match. */
export async function scoreRound(ctx: Ctx, jwt: string, eventId: string, roundNumber: number,
  scores: Array<[number, number] | 'not_played' | 'skip'> = []) {
  const [round] = await ctx.c.sel<{ id: string }[]>('event_rounds', `event_id=eq.${eventId}&round_number=eq.${roundNumber}&select=id`);
  if (!round) throw new Error(`event ${eventId} has no round ${roundNumber}`);
  const matches = await ctx.c.sel<{ id: string; status: string }[]>('event_matches', `round_id=eq.${round.id}&select=id,status&order=match_number.asc`);
  for (const [i, m] of matches.entries()) {
    if (m.status !== 'pending') continue;
    const s = scores[i] ?? [24, 16];
    if (s === 'skip') continue;
    if (s === 'not_played') {
      await ctx.c.rpc(jwt, 'submit_score', { p_match_id: m.id, p_side_a: 0, p_side_b: 0, p_not_played: true });
    } else {
      await ctx.c.rpc(jwt, 'submit_score', { p_match_id: m.id, p_side_a: s[0], p_side_b: s[1], p_not_played: false });
    }
  }
}
