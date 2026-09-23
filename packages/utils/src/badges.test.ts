import { describe, expect, it } from 'vitest';

import { BADGES, evaluateBadges, sortBadges, type BadgeFacts } from './badges';

const ZERO: BadgeFacts = {
  matches_scored: 0,
  matches_won: 0,
  ranked_events_finished: 0,
  best_placement: null,
  event_wins: 0,
  longest_win_streak: 0,
  longest_week_streak: 0,
  distinct_partners: 0,
  max_wins_with_partner: 0,
  following_count: 0,
  followers_count: 0,
  events_attended: 0,
  events_organised: 0,
  communities_joined: 0,
  communities_created: 0,
  largest_community_created: 0,
  groups_joined: 0,
  signup_rank: 0,
  account_age_days: 0,
};

const by = (states: ReturnType<typeof evaluateBadges>, id: string) => states.find((s) => s.id === id)!;

describe('evaluateBadges', () => {
  it('a brand-new account has unlocked nothing except the rank-based one', () => {
    // signup_rank 0 is not a real value — a real caller is 1 or higher — but it proves the
    // `atMost` branch is what makes Founding Jammer behave differently from everything else.
    const states = evaluateBadges({ ...ZERO, signup_rank: 5000 });
    expect(states.filter((s) => s.unlocked)).toHaveLength(0);
  });

  it('counts how many thresholds a value has cleared', () => {
    const states = evaluateBadges({ ...ZERO, matches_scored: 120 });
    const regular = by(states, 'courtRegular');
    expect(regular.tier).toBe(3); // 10, 50, 100 cleared; 500 not
    expect(regular.next).toBe(500);
    expect(regular.tiers).toBe(4);
    expect(regular.unlocked).toBe(true);
  });

  it('reports no next threshold at the top tier', () => {
    const states = evaluateBadges({ ...ZERO, matches_scored: 500 });
    expect(by(states, 'courtRegular').tier).toBe(4);
    expect(by(states, 'courtRegular').next).toBeNull();
  });

  it('a single-tier badge is unlocked or it is not', () => {
    expect(by(evaluateBadges({ ...ZERO, communities_created: 0 }), 'founder').unlocked).toBe(false);
    const founder = by(evaluateBadges({ ...ZERO, communities_created: 1 }), 'founder');
    expect(founder.unlocked).toBe(true);
    expect(founder.tier).toBe(1);
    expect(founder.next).toBeNull();
  });

  it('Founding Jammer unlocks BELOW its threshold, not above', () => {
    expect(by(evaluateBadges({ ...ZERO, signup_rank: 1 }), 'foundingJammer').unlocked).toBe(true);
    expect(by(evaluateBadges({ ...ZERO, signup_rank: 1000 }), 'foundingJammer').unlocked).toBe(true);
    expect(by(evaluateBadges({ ...ZERO, signup_rank: 1001 }), 'foundingJammer').unlocked).toBe(false);
  });

  it('the two badges sharing events_attended keep their own tiers', () => {
    const states = evaluateBadges({ ...ZERO, events_attended: 25 });
    expect(by(states, 'roundRobinRookie').tier).toBe(1); // threshold 1
    expect(by(states, 'showedUp').tier).toBe(2);         // 5, 25
    expect(by(states, 'rrRegular').tier).toBe(2);        // 5, 25 (its 50/100 remain)
    expect(by(states, 'rrRegular').next).toBe(50);
  });

  it('a null fact does not throw', () => {
    expect(() => evaluateBadges({ ...ZERO, best_placement: null })).not.toThrow();
  });

  it('every catalogue entry names a fact that exists', () => {
    for (const def of BADGES) expect(Object.keys(ZERO)).toContain(def.fact);
  });

  it('tiers are ascending, which the tier count relies on', () => {
    for (const def of BADGES) {
      const sorted = [...def.tiers].sort((a, b) => a - b);
      expect(def.tiers).toEqual(sorted);
    }
  });
});

describe('sortBadges', () => {
  it('puts unlocked first, then the closest to unlocking', () => {
    const states = evaluateBadges({
      ...ZERO,
      communities_created: 1, // founder: unlocked
      matches_scored: 9,      // courtRegular: 9/10, very close
      following_count: 1,     // theConnector: 1/5, further off
    });
    const order = sortBadges(states).map((s) => s.id);
    expect(order[0]).toBe('firstServe'); // also unlocked (matches_scored >= 1)
    expect(order.indexOf('courtRegular')).toBeLessThan(order.indexOf('theConnector'));
  });
});
