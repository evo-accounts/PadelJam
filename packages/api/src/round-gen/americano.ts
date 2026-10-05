/**
 * Americano round-robin schedule generator (client-side).
 *
 * Only the Americano schedule is built on the client; the backend seeds the
 * Mexicano and Up&Down rounds server-side (they depend on running standings).
 * start_event validates the schedule it is given (migrations 0122, 0126): every
 * id a confirmed participant, and — per modality — every side an event_teams
 * pair (Team) or one man and one woman (Mixed).
 *
 * The event's modality decides how pairs are formed (UX-MEVT-23/25/27, UX-LIVE-20):
 *
 *   Classic  partners rotate freely          → `americanoSchedule`
 *   Team     the pair plays the whole event  → `teamAmericanoSchedule`
 *   Mixed    every pair is a man + a woman   → `mixedAmericanoSchedule`
 *
 * `buildAmericanoSchedule` dispatches on the roster's modality.
 *
 * CLASSIC — "social mixer" / whist rotation:
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
 * Determinism: the functions perform no randomness. Any desired shuffle/seeding
 * must be applied by the caller to the ids before calling.
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

/** Who plays, and how the event forms its pairs. */
export type AmericanoRoster =
  | { specification: 'classic'; participantIds: string[] }
  /** Fixed pairs (event_teams), in team order. */
  | { specification: 'team'; teams: [string, string][] }
  /** Confirmed men and women, each in seeding order. */
  | { specification: 'mixed'; men: string[]; women: string[] };

/** The Americano schedule for any modality. */
export function buildAmericanoSchedule(roster: AmericanoRoster, numCourts: number): RoundPlan[] {
  switch (roster.specification) {
    case 'team':
      return teamAmericanoSchedule(roster.teams, numCourts);
    case 'mixed':
      return mixedAmericanoSchedule(roster.men, roster.women, numCourts);
    default:
      return americanoSchedule(roster.participantIds, numCourts);
  }
}

/**
 * Build the Classic Americano schedule for `participantIds` across `numCourts` courts.
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

/**
 * TEAM — a round-robin of fixed pairs (IN-PROGRESS §Round count: T − 1 rounds for an even
 * number of teams, T with a bye each round for an odd number).
 *
 * The pair never splits: every side of every match is one of `teams`. Teams are scheduled with
 * the circle method over the teams (a phantom "bye" completes an odd count). When a circle round
 * holds more matches than there are courts, the full round-robin is instead packed onto the
 * courts round by round — each round seats, in round-robin order, the matches whose teams have
 * played the fewest games so far — so every pairing is still played once and the teams that sit
 * out rotate (rounds then exceed T − 1). Resting teams rest BOTH players.
 */
export function teamAmericanoSchedule(teams: [string, string][], numCourts: number): RoundPlan[] {
  const t = teams.length;
  if (t < 2 || numCourts < 1) return [];

  // Round-robin over team indices; -1 is the bye.
  const slots = t % 2 === 0 ? teams.map((_, i) => i) : [...teams.map((_, i) => i), -1];
  const s = slots.length;
  const circleRounds: [number, number][][] = [];
  for (let r = 0; r < s - 1; r++) {
    const ring = rotate(slots.slice(1), r);
    const pairs: [number, number][] = [[slots[0]!, ring[0]!]];
    for (let lo = 1, hi = s - 2; lo < hi; lo++, hi--) pairs.push([ring[lo]!, ring[hi]!]);
    circleRounds.push(pairs.filter(([a, b]) => a >= 0 && b >= 0));
  }

  let rounds: [number, number][][];
  if (Math.floor(t / 2) <= numCourts) {
    rounds = circleRounds;
  } else {
    const queue = circleRounds.flat();
    const played = new Array<number>(t).fill(0);
    rounds = [];
    while (queue.length > 0) {
      // Stable: equal load keeps round-robin order.
      const order = queue
        .map((m, i) => ({ m, i, load: played[m[0]]! + played[m[1]]! }))
        .sort((x, y) => x.load - y.load || x.i - y.i);
      const used = new Set<number>();
      const picked: number[] = [];
      for (const { m, i } of order) {
        if (picked.length === numCourts) break;
        if (used.has(m[0]) || used.has(m[1])) continue;
        used.add(m[0]);
        used.add(m[1]);
        picked.push(i);
      }
      const round = picked.map((i) => queue[i]!);
      for (const [a, b] of round) {
        played[a]!++;
        played[b]!++;
      }
      for (const i of [...picked].sort((a, b) => b - a)) queue.splice(i, 1);
      rounds.push(round);
    }
  }

  return rounds.map((round, r) => {
    const seated = new Set(round.flat());
    return {
      roundNumber: r + 1,
      matches: round.map(([a, b], k) => ({
        courtNumber: k + 1,
        matchNumber: k + 1,
        sideA: [teams[a]![0], teams[a]![1]],
        sideB: [teams[b]![0], teams[b]![1]],
      })),
      rests: teams.flatMap((pair, i) => (seated.has(i) ? [] : [pair[0], pair[1]])),
    };
  });
}

/**
 * MIXED — partners rotate, but every pair is one man and one woman (UX-MEVT-25, UX-LIVE-20).
 *
 * A court seats two men and two women. `courts = min(numCourts, floor(min(men, women) / 2))`.
 * With everyone seated, round r partners man i with woman (i + r) mod M, so over M rounds every
 * man partners every woman exactly once. The seated pairs then meet by the circle method over the
 * pairs, rotated each round, so opponents vary. When not everyone fits, men and women each rotate
 * a rest window over their own list (as Classic does), so the players who rest are always a
 * balanced set and rotate fairly. Rounds: max(men, women).
 */
export function mixedAmericanoSchedule(men: string[], women: string[], numCourts: number): RoundPlan[] {
  if (numCourts < 1) return [];
  const courts = Math.min(numCourts, Math.floor(Math.min(men.length, women.length) / 2));
  if (courts < 1) return [];
  const seatedPerSide = courts * 2;
  const numRounds = Math.max(men.length, women.length);

  const plans: RoundPlan[] = [];
  for (let r = 0; r < numRounds; r++) {
    const m = men.length > seatedPerSide ? rotate(men, r) : men;
    const w = women.length > seatedPerSide ? rotate(women, r) : women;
    const seatedMen = m.slice(0, seatedPerSide);
    const seatedWomen = w.slice(0, seatedPerSide);
    const pairs: [string, string][] = seatedMen.map((man, i) => [
      man,
      seatedWomen[(i + r) % seatedPerSide]!,
    ]);

    // Circle method over the pair indices: fixed 0, ring rotated by r.
    const ring = rotate(
      pairs.map((_, i) => i).slice(1),
      r,
    );
    const meetings: [number, number][] = [[0, ring[0]!]];
    for (let lo = 1, hi = seatedPerSide - 2; lo < hi; lo++, hi--) meetings.push([ring[lo]!, ring[hi]!]);

    plans.push({
      roundNumber: r + 1,
      matches: meetings.map(([a, b], k) => ({
        courtNumber: k + 1,
        matchNumber: k + 1,
        sideA: pairs[a]!,
        sideB: pairs[b]!,
      })),
      rests: [...m.slice(seatedPerSide), ...w.slice(seatedPerSide)],
    });
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
