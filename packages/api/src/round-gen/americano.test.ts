import { describe, it, expect } from 'vitest';
import {
  americanoSchedule,
  buildAmericanoSchedule,
  mixedAmericanoSchedule,
  teamAmericanoSchedule,
  type RoundPlan,
} from './americano';

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

// ---------------------------------------------------------------------------------------------
// Modality (migration 0126, UX-MEVT-23/25/27, UX-LIVE-20)
// ---------------------------------------------------------------------------------------------

const teamsOf = (n: number): [string, string][] =>
  Array.from({ length: n }, (_, i) => [`t${i + 1}a`, `t${i + 1}b`]);
const pairKey = (side: readonly string[]) => [...side].sort().join('|');

/** No one twice in a round, playing or resting. */
function expectNoDoubleBooking(plan: RoundPlan[]) {
  for (const round of plan) {
    const all = [...playersInRound(round), ...round.rests];
    expect(new Set(all).size).toBe(all.length);
  }
}

describe('teamAmericanoSchedule', () => {
  it.each([
    [4, 2, 3], // T even: T-1 rounds
    [5, 2, 5], // T odd: T rounds, one bye each
    [6, 3, 5],
    [2, 1, 1],
  ])('%i teams / %i courts → %i rounds, every side an intact pair, every pairing once', (t, courts, rounds) => {
    const teams = teamsOf(t);
    const plan = teamAmericanoSchedule(teams, courts);
    expect(plan).toHaveLength(rounds);
    const valid = new Set(teams.map(pairKey));
    const meetings = new Set<string>();
    for (const round of plan) {
      for (const m of round.matches) {
        expect(valid.has(pairKey(m.sideA))).toBe(true);
        expect(valid.has(pairKey(m.sideB))).toBe(true);
        const key = [pairKey(m.sideA), pairKey(m.sideB)].sort().join(' v ');
        expect(meetings.has(key)).toBe(false);
        meetings.add(key);
      }
      // A team rests whole: both partners or neither.
      for (const [a, b] of teams) expect(round.rests.includes(a)).toBe(round.rests.includes(b));
    }
    expect(meetings.size).toBe((t * (t - 1)) / 2);
    expectNoDoubleBooking(plan);
  });

  it('never splits a pair across all rounds (8 teams / 4 courts)', () => {
    const teams = teamsOf(8);
    const partner = new Map(teams.flatMap(([a, b]) => [[a, b] as const, [b, a] as const]));
    for (const round of teamAmericanoSchedule(teams, 4)) {
      expect(round.rests).toHaveLength(0);
      for (const m of round.matches) {
        expect(partner.get(m.sideA[0])).toBe(m.sideA[1]);
        expect(partner.get(m.sideB[0])).toBe(m.sideB[1]);
      }
    }
  });

  it('more teams than courts: every pairing still played, courts full, rests fair', () => {
    const teams = teamsOf(6);
    const plan = teamAmericanoSchedule(teams, 2); // 3 matches a circle round, 2 courts
    const meetings = new Set<string>();
    const rests = new Map<string, number>();
    for (const round of plan) {
      expect(round.matches.length).toBeLessThanOrEqual(2);
      for (const m of round.matches) meetings.add([pairKey(m.sideA), pairKey(m.sideB)].sort().join(' v '));
      for (const [a] of teams) if (round.rests.includes(a)) rests.set(a, (rests.get(a) ?? 0) + 1);
    }
    expect(meetings.size).toBe(15);
    expect(plan).toHaveLength(8); // ceil(15 / 2)
    expect(plan.slice(0, -1).every((r) => r.matches.length === 2)).toBe(true);
    const counts = teams.map(([a]) => rests.get(a) ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expectNoDoubleBooking(plan);
  });

  it('below capacity: 3 teams on 2 courts use one court, the bye rotates', () => {
    const teams = teamsOf(3);
    const plan = teamAmericanoSchedule(teams, 2);
    expect(plan).toHaveLength(3);
    const byes = plan.map((r) => r.rests.join(','));
    expect(new Set(byes).size).toBe(3);
    for (const r of plan) {
      expect(r.matches).toHaveLength(1);
      expect(r.rests).toHaveLength(2);
    }
  });
});

describe('mixedAmericanoSchedule', () => {
  const men = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`);
  const women = (n: number) => Array.from({ length: n }, (_, i) => `w${i + 1}`);
  const isMixedSide = (side: readonly string[]) =>
    side.filter((p) => p.startsWith('m')).length === 1 && side.filter((p) => p.startsWith('w')).length === 1;

  it('4 men + 4 women / 2 courts → 4 rounds, every pair M+F, every man partners every woman once', () => {
    const plan = mixedAmericanoSchedule(men(4), women(4), 2);
    expect(plan).toHaveLength(4);
    const partnerships = new Set<string>();
    const opponents = new Set<string>();
    for (const round of plan) {
      expect(round.matches).toHaveLength(2);
      expect(round.rests).toHaveLength(0);
      for (const m of round.matches) {
        expect(isMixedSide(m.sideA)).toBe(true);
        expect(isMixedSide(m.sideB)).toBe(true);
        for (const side of [m.sideA, m.sideB]) {
          const key = pairKey(side);
          expect(partnerships.has(key)).toBe(false);
          partnerships.add(key);
        }
        opponents.add([pairKey(m.sideA), pairKey(m.sideB)].sort().join(' v '));
      }
    }
    expect(partnerships.size).toBe(16);
    expect(opponents.size).toBe(8); // no repeated meeting of the same two pairs
    expectNoDoubleBooking(plan);
  });

  it('2 + 2 on one court → both mixed pairings', () => {
    const plan = mixedAmericanoSchedule(men(2), women(2), 1);
    expect(plan).toHaveLength(2);
    for (const r of plan) for (const m of r.matches) {
      expect(isMixedSide(m.sideA)).toBe(true);
      expect(isMixedSide(m.sideB)).toBe(true);
    }
  });

  it('below capacity / stand-by: 5 + 5 on 2 courts → one man and one woman rest, rests rotate fairly', () => {
    const plan = mixedAmericanoSchedule(men(5), women(5), 2);
    expect(plan).toHaveLength(5);
    const rests = new Map<string, number>();
    for (const round of plan) {
      expect(round.matches).toHaveLength(2);
      expect(round.rests.filter((p) => p.startsWith('m'))).toHaveLength(1);
      expect(round.rests.filter((p) => p.startsWith('w'))).toHaveLength(1);
      for (const m of round.matches) {
        expect(isMixedSide(m.sideA)).toBe(true);
        expect(isMixedSide(m.sideB)).toBe(true);
      }
      for (const p of round.rests) rests.set(p, (rests.get(p) ?? 0) + 1);
    }
    expect([...rests.values()].every((c) => c === 1)).toBe(true);
    expect(rests.size).toBe(10);
    expectNoDoubleBooking(plan);
  });

  it('3 + 3 on 2 courts seats one court (largest multiple of 4)', () => {
    const plan = mixedAmericanoSchedule(men(3), women(3), 2);
    for (const r of plan) {
      expect(r.matches).toHaveLength(1);
      expect(r.rests).toHaveLength(2);
    }
  });
});

describe('buildAmericanoSchedule', () => {
  it('dispatches on the modality; classic is unchanged', () => {
    expect(buildAmericanoSchedule({ specification: 'classic', participantIds: ids(8) }, 2)).toEqual(
      americanoSchedule(ids(8), 2),
    );
    expect(buildAmericanoSchedule({ specification: 'team', teams: teamsOf(4) }, 2)).toEqual(
      teamAmericanoSchedule(teamsOf(4), 2),
    );
    expect(
      buildAmericanoSchedule({ specification: 'mixed', men: ['m1', 'm2'], women: ['w1', 'w2'] }, 1),
    ).toEqual(mixedAmericanoSchedule(['m1', 'm2'], ['w1', 'w2'], 1));
  });
});
