/**
 * Americano round-robin schedule generator (client-side).
 *
 * Only the Americano schedule is built on the client; the backend seeds the
 * Mexicano and Up&Down rounds server-side (they depend on running standings).
 *
 * ALGORITHM — "social mixer" / whist rotation:
 *
 * Americano is a *partner-rotating* format: across the event every player
 * should partner as many different people as possible and face everyone. The
 * classic construction for N players (N a multiple of 4) produces N-1 rounds
 * in which every player partners every other player exactly once — the same
 * round structure as a whist drive. We use the standard rotation:
 *
 *   - Fix player 0. Arrange the remaining N-1 players around a circle and
 *     rotate them one seat each round (the "circle method", N-1 rotations).
 *   - In each round, pair players from opposite ends of the circle to form
 *     teams, then group consecutive teams onto courts (team k vs team k+1).
 *
 * This yields, for N players that are a multiple of 4:
 *   - N-1 rounds,
 *   - N/4 courts fully used each round (4 players per court, 2 v 2),
 *   - every player partners every other exactly once.
 *
 * RESTS / surplus handling (when N is NOT a clean multiple of 4, or when there
 * are more players than `numCourts * 4` can seat):
 *   - `playable = min(N - (N % 4), numCourts * 4)` players are seated each
 *     round; the rest sit out.
 *   - To keep rests fair we rotate a "rest cursor" across the *full* roster so
 *     that over the rounds every player sits out a roughly equal number of
 *     times. The seated subset for a round is taken as a contiguous window of
 *     the rotated roster, and the social rotation above is applied within it.
 *
 * Determinism: the function performs no randomness. Any desired shuffle/seeding
 * must be applied by the caller to `participantIds` before calling.
 */

export type RoundMatch = {
  courtNumber: number;
  matchNumber: number;
  sideA: [string, string];
  sideB: [string, string];
};

export type RoundPlan = {
  roundNumber: number;
  matches: RoundMatch[];
  rests: string[];
};

/**
 * Build the Americano schedule for `participantIds` across `numCourts` courts.
 */
export function americanoSchedule(participantIds: string[], numCourts: number): RoundPlan[] {
  const n = participantIds.length;
  if (n < 4 || numCourts < 1) return [];

  const seatPerCourt = 4;
  const maxSeated = Math.min(n - (n % 4), numCourts * seatPerCourt);
  if (maxSeated < 4) return [];

  // Number of rounds: the classic Americano runs N-1 rounds when the whole
  // roster is seated (everyone partners everyone once). When players rest each
  // round we keep the same N-1 cadence so rests rotate fully across the roster.
  const numRounds = n - 1;

  const plans: RoundPlan[] = [];

  const hasRests = maxSeated < n;

  for (let r = 0; r < numRounds; r++) {
    // When some players rest, rotate the roster by r so the rest window (the
    // tail beyond `maxSeated`) sweeps every player roughly equally. When the
    // whole roster is seated there are no rests, so the roster is left in place
    // and the social rotation is driven entirely by `pairSeated` — that keeps
    // the canonical N-1 1-factorization (everyone partners everyone once).
    const rotated = hasRests ? rotate(participantIds, r) : participantIds;
    const seated = rotated.slice(0, maxSeated);
    const rests = rotated.slice(maxSeated);

    const matches = pairSeated(seated, r);

    plans.push({ roundNumber: r + 1, matches, rests });
  }

  return plans;
}

/** Rotate an array left by `k` (k may exceed length). */
function rotate<T>(arr: T[], k: number): T[] {
  const len = arr.length;
  if (len === 0) return [];
  const shift = ((k % len) + len) % len;
  return arr.slice(shift).concat(arr.slice(0, shift));
}

/**
 * Pair an exactly-divisible-by-4 seated set into 2v2 matches using the
 * round-robin circle method (1-factorization), varying the rotation by `round`
 * so every player partners every other exactly once across the schedule.
 *
 * Standard construction: fix `seated[0]`, arrange the rest in a ring and rotate
 * it by `round`. The N/2 partnerships of a round are then:
 *   fixed     + ring[0]
 *   ring[1]   + ring[m-2]
 *   ring[2]   + ring[m-3]
 *   ...
 * Over m-1 rotations this covers all C(m,2) partnerships exactly once.
 */
function pairSeated(seated: string[], round: number): RoundMatch[] {
  const m = seated.length; // multiple of 4 (guaranteed by the caller)
  const fixed = seated[0]!;
  const ring = rotate(seated.slice(1), round); // length m-1

  const teams: [string, string][] = [];
  teams.push([fixed, ring[0]!]);
  // Pair opposite ends of the remaining ring (ring[1..m-2]).
  let lo = 1;
  let hi = m - 2;
  while (lo < hi) {
    teams.push([ring[lo]!, ring[hi]!]);
    lo++;
    hi--;
  }

  // Group consecutive teams onto courts: team[2c] vs team[2c+1].
  const matches: RoundMatch[] = [];
  for (let c = 0; c < teams.length / 2; c++) {
    matches.push({
      courtNumber: c + 1,
      matchNumber: c + 1,
      sideA: teams[2 * c]!,
      sideB: teams[2 * c + 1]!,
    });
  }
  return matches;
}
