/**
 * The badge catalogue, and the pure function that turns counters into unlock states.
 *
 * The database returns NUMBERS ONLY (`player_badge_facts`, migration 0105). Every threshold lives
 * here, in code, so tuning the catalogue is a pull request rather than another migration pasted by
 * hand into the hosted database. That was the condition for shipping badges without a `badges`
 * table at all.
 *
 * This is the v1.0 catalogue's recommended MVP launch set, minus the three that need features the
 * app does not have: Booking Boss (no court booking), Level Up (no ranking tiers) and The Tray
 * (no signature-shot tagging). Seventeen remain.
 *
 * TWO OF THE SEVENTEEN SHIP ON A SUBSTITUTE, agreed with the product owner rather than assumed:
 *
 *   showedUp      the catalogue says "community events attended". There is no check-in, so this
 *                 counts events the player RSVP'd `confirmed` to that later completed. Someone who
 *                 confirmed and never turned up still earns it.
 *   theConnector  the catalogue says "friends added in-app". There is no friends model; follows
 *                 are the only social edge. Its copy says "people you follow" so the badge does
 *                 not claim something the app does not do.
 *
 * `showedUp` and `rrRegular` deliberately read the same counter. Every `events.event_type` the
 * schema allows — americano, mexicano, up_and_down — is a round robin, so "community events
 * attended" and "round robin events played" are the same number counted for different reasons.
 * They are kept separate because the catalogue files them under different categories and their
 * tiers differ; if a non-round-robin event type is ever added, only `rrRegular` changes.
 */

/** Exactly the shape `player_badge_facts` returns. Adding a counter means adding it in both. */
export type BadgeFacts = {
  matches_scored: number;
  matches_won: number;
  ranked_events_finished: number;
  best_placement: number | null;
  event_wins: number;
  longest_win_streak: number;
  longest_week_streak: number;
  distinct_partners: number;
  max_wins_with_partner: number;
  following_count: number;
  followers_count: number;
  events_attended: number;
  events_organised: number;
  communities_joined: number;
  communities_created: number;
  largest_community_created: number;
  groups_joined: number;
  signup_rank: number;
  account_age_days: number;
};

export type BadgeId =
  | 'firstServe' | 'firstTribe' | 'roundRobinRookie'
  | 'courtRegular' | 'weeklyWarrior' | 'onFire' | 'winColumn'
  | 'theConnector' | 'mixMaster' | 'wingman'
  | 'showedUp' | 'founder' | 'theHost' | 'communityBuilder'
  | 'rrRegular' | 'rrChampion' | 'foundingJammer';

export type BadgeCategory = 'gettingStarted' | 'loyalty' | 'engagement' | 'skill' | 'social' | 'communities' | 'competition' | 'rare';

export type BadgeDef = {
  id: BadgeId;
  category: BadgeCategory;
  fact: keyof BadgeFacts;
  /** Ascending thresholds. A single entry is an untiered badge. */
  tiers: number[];
  /**
   * `atMost` inverts the comparison: the badge unlocks when the fact is at or BELOW the threshold.
   * Only Founding Jammer needs it — its fact is a signup rank, where lower is rarer.
   */
  direction?: 'atLeast' | 'atMost';
};

export const BADGES: BadgeDef[] = [
  { id: 'firstServe', category: 'gettingStarted', fact: 'matches_scored', tiers: [1] },
  { id: 'firstTribe', category: 'gettingStarted', fact: 'communities_joined', tiers: [1] },
  { id: 'roundRobinRookie', category: 'gettingStarted', fact: 'events_attended', tiers: [1] },

  { id: 'courtRegular', category: 'loyalty', fact: 'matches_scored', tiers: [10, 50, 100, 500] },

  { id: 'weeklyWarrior', category: 'engagement', fact: 'longest_week_streak', tiers: [4, 12, 26, 52] },
  { id: 'onFire', category: 'engagement', fact: 'longest_win_streak', tiers: [3, 5, 10, 20] },

  { id: 'winColumn', category: 'skill', fact: 'matches_won', tiers: [10, 50, 100, 500] },

  { id: 'theConnector', category: 'social', fact: 'following_count', tiers: [5, 25, 50, 100] },
  { id: 'mixMaster', category: 'social', fact: 'distinct_partners', tiers: [10, 25, 50] },
  { id: 'wingman', category: 'social', fact: 'max_wins_with_partner', tiers: [10, 25, 50] },

  { id: 'showedUp', category: 'communities', fact: 'events_attended', tiers: [5, 25, 100] },
  { id: 'founder', category: 'communities', fact: 'communities_created', tiers: [1] },
  { id: 'theHost', category: 'communities', fact: 'events_organised', tiers: [5, 25, 100] },
  { id: 'communityBuilder', category: 'communities', fact: 'largest_community_created', tiers: [25, 100, 500] },

  { id: 'rrRegular', category: 'competition', fact: 'events_attended', tiers: [5, 25, 50, 100] },
  { id: 'rrChampion', category: 'competition', fact: 'event_wins', tiers: [1] },

  // Never re-issued: rank is by `profiles.created_at` and a hard delete is impossible, so the
  // ordering cannot shift under an existing holder.
  { id: 'foundingJammer', category: 'rare', fact: 'signup_rank', tiers: [1000], direction: 'atMost' },
];

export type BadgeState = {
  id: BadgeId;
  category: BadgeCategory;
  /** 0 when locked; otherwise which threshold has been reached, 1-based. */
  tier: number;
  unlocked: boolean;
  /** The counter's current value, for "3 of 10" progress copy. */
  value: number;
  /** The next threshold, or null at the top tier. */
  next: number | null;
  /** How many tiers this badge has, so the UI can say "2 of 4". */
  tiers: number;
};

/**
 * Pure. Given the facts, say where every badge stands.
 *
 * A null fact (only `best_placement`, for a player with no ranked events) counts as 0 rather than
 * throwing — no badge reads it today, but a future one shouldn't crash the whole list.
 */
export function evaluateBadges(facts: BadgeFacts): BadgeState[] {
  return BADGES.map((def) => {
    const value = facts[def.fact] ?? 0;
    const atMost = def.direction === 'atMost';
    // Count how many thresholds this value has cleared. Tiers are ascending, so for `atMost` the
    // comparison flips but the ordering does not.
    const tier = def.tiers.reduce(
      (reached, threshold) => (atMost ? value <= threshold : value >= threshold) ? reached + 1 : reached,
      0,
    );
    return {
      id: def.id,
      category: def.category,
      tier,
      unlocked: tier > 0,
      value,
      next: tier < def.tiers.length ? def.tiers[tier]! : null,
      tiers: def.tiers.length,
    };
  });
}

/** Unlocked first, then by how close the next tier is — so a list leads with what was earned. */
export function sortBadges(states: BadgeState[]): BadgeState[] {
  return [...states].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked) return b.tier - a.tier;
    const aProgress = a.next ? a.value / a.next : 0;
    const bProgress = b.next ? b.value / b.next : 0;
    return bProgress - aProgress;
  });
}
