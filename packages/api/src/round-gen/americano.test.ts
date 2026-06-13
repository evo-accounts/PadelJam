import { describe, it, expect } from 'vitest';
import { americanoSchedule, type RoundPlan } from './americano';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

function playersInRound(plan: RoundPlan): string[] {
  return plan.matches.flatMap((m) => [...m.sideA, ...m.sideB]);
}

function partnerPairs(plan: RoundPlan): Set<string> {
  const out = new Set<string>();
  for (const m of plan.matches) {
    out.add([...m.sideA].sort().join('|'));
    out.add([...m.sideB].sort().join('|'));
  }
  return out;
}

describe('americanoSchedule', () => {
  it('4 players / 1 court → 3 rounds, every partnership once, no double-play', () => {
    const plan = americanoSchedule(ids(4), 1);
    expect(plan).toHaveLength(3);

    const allPartnerships = new Set<string>();
    for (const round of plan) {
      // 1 court, 2v2, no rests
      expect(round.matches).toHaveLength(1);
      expect(round.rests).toHaveLength(0);
      expect(round.matches[0]!.sideA).toHaveLength(2);
      expect(round.matches[0]!.sideB).toHaveLength(2);

      // no participant appears twice in a round
      const seated = playersInRound(round);
      expect(new Set(seated).size).toBe(seated.length);
      expect(seated.length).toBe(4);

      for (const pair of partnerPairs(round)) {
        expect(allPartnerships.has(pair)).toBe(false);
        allPartnerships.add(pair);
      }
    }
    // 4 players → C(4,2) = 6 distinct partnerships, all covered.
    expect(allPartnerships.size).toBe(6);
  });

  it('8 players / 2 courts → 7 rounds, 4 per court, everyone plays each round', () => {
    const plan = americanoSchedule(ids(8), 2);
    expect(plan).toHaveLength(7);

    const allPartnerships = new Set<string>();
    for (const round of plan) {
      expect(round.matches).toHaveLength(2);
      expect(round.rests).toHaveLength(0);

      const seated = playersInRound(round);
      expect(seated.length).toBe(8);
      expect(new Set(seated).size).toBe(8); // no duplicates within a round

      for (const m of round.matches) {
        expect(m.sideA).toHaveLength(2);
        expect(m.sideB).toHaveLength(2);
      }

      for (const pair of partnerPairs(round)) {
        expect(allPartnerships.has(pair)).toBe(false);
        allPartnerships.add(pair);
      }
    }
    // 8 players → C(8,2) = 28 partnerships, every one exactly once over 7 rounds.
    expect(allPartnerships.size).toBe(28);
  });

  it('5 players / 1 court → each round rests exactly 1, rests rotate fairly', () => {
    const plan = americanoSchedule(ids(5), 1);
    expect(plan).toHaveLength(4); // n-1 rounds

    const restCounts: Record<string, number> = {};
    for (const round of plan) {
      expect(round.matches).toHaveLength(1);
      expect(round.rests).toHaveLength(1);

      const seated = playersInRound(round);
      expect(seated.length).toBe(4);
      expect(new Set(seated).size).toBe(4); // no duplicate in a round
      // rested player is not seated
      expect(seated).not.toContain(round.rests[0]);

      for (const id of round.rests) restCounts[id] = (restCounts[id] ?? 0) + 1;
    }
    // Over 4 rounds, 4 distinct players each rest once (fair rotation).
    const counts = Object.values(restCounts);
    expect(counts.every((c) => c === 1)).toBe(true);
    expect(Object.keys(restCounts).length).toBe(4);
  });

  it('matches the RoundPlan shape', () => {
    const [round] = americanoSchedule(ids(4), 1);
    expect(round).toBeDefined();
    expect(round).toEqual(
      expect.objectContaining({
        roundNumber: expect.any(Number),
        matches: expect.any(Array),
        rests: expect.any(Array),
      }),
    );
    expect(round!.matches[0]).toEqual(
      expect.objectContaining({
        courtNumber: expect.any(Number),
        matchNumber: expect.any(Number),
        sideA: expect.any(Array),
        sideB: expect.any(Array),
      }),
    );
  });
});
