export const PLAN_IDS = {
  account: ['free', 'jammer_plus'],
  community: ['starter', 'basic', 'community_pro', 'club'],
} as const;
export type AccountPlanId = (typeof PLAN_IDS.account)[number];
export type CommunityPlanId = (typeof PLAN_IDS.community)[number];

export const ACCOUNT_FEATURES = [
  'unlimited_match_history', 'advanced_stats', 'ad_free', 'custom_icon',
  'match_insights', 'custom_rivalries', 'exclusive_avatar_items', 'waiting_list_priority',
  'badges_xp', 'home_club',
] as const;
export const COMMUNITY_FEATURES = [
  'event_management', 'community_feed', 'discoverability', 'custom_broadcasts',
  'priority_support', 'jammer_plus_included', 'analytics_basic', 'analytics_pro',
  'paid_events', 'coach_mode', 'custom_url', 'multiple_communities', 'staff_accounts',
  'api_access', 'tournament_management',
] as const;
export const LIMIT_KEYS = [
  'members_per_community', 'groups_per_community', 'recurring_events', 'co_organizers',
] as const;

export type AccountFeatureKey = (typeof ACCOUNT_FEATURES)[number];
export type CommunityFeatureKey = (typeof COMMUNITY_FEATURES)[number];
export type LimitKey = (typeof LIMIT_KEYS)[number];

export interface PlanDef {
  id: string;
  dimension: 'account' | 'community';
  isDefault: boolean;
  mvp: boolean;
  features: readonly { key: string; mvp: boolean }[];
  limits?: Partial<Record<LimitKey, number | null>>;
}

export const PLAN_MATRIX: readonly PlanDef[] = [
  { id: 'free', dimension: 'account', isDefault: true, mvp: true, features: [] },
  {
    id: 'jammer_plus', dimension: 'account', isDefault: false, mvp: true,
    features: [
      { key: 'unlimited_match_history', mvp: true }, { key: 'advanced_stats', mvp: true },
      { key: 'ad_free', mvp: true }, { key: 'custom_icon', mvp: true },
      { key: 'match_insights', mvp: false }, { key: 'custom_rivalries', mvp: false },
      { key: 'exclusive_avatar_items', mvp: false }, { key: 'waiting_list_priority', mvp: false },
      { key: 'badges_xp', mvp: false }, { key: 'home_club', mvp: false },
    ],
  },
  {
    id: 'starter', dimension: 'community', isDefault: true, mvp: true,
    features: [
      { key: 'event_management', mvp: true }, { key: 'community_feed', mvp: true },
      { key: 'discoverability', mvp: true },
    ],
    limits: { members_per_community: 10, groups_per_community: 1, recurring_events: 1, co_organizers: 0 },
  },
  {
    id: 'basic', dimension: 'community', isDefault: false, mvp: true,
    features: [
      { key: 'event_management', mvp: true }, { key: 'community_feed', mvp: true },
      { key: 'discoverability', mvp: true }, { key: 'custom_broadcasts', mvp: true },
      { key: 'jammer_plus_included', mvp: true }, { key: 'analytics_basic', mvp: false },
    ],
    limits: { members_per_community: 50, groups_per_community: 3, recurring_events: 5, co_organizers: 1 },
  },
  {
    id: 'community_pro', dimension: 'community', isDefault: false, mvp: true,
    features: [
      { key: 'event_management', mvp: true }, { key: 'community_feed', mvp: true },
      { key: 'discoverability', mvp: true }, { key: 'custom_broadcasts', mvp: true },
      { key: 'priority_support', mvp: true }, { key: 'jammer_plus_included', mvp: true },
      { key: 'analytics_pro', mvp: false }, { key: 'paid_events', mvp: false },
      { key: 'coach_mode', mvp: false }, { key: 'custom_url', mvp: false },
    ],
    limits: { members_per_community: 250, groups_per_community: null, recurring_events: null, co_organizers: 3 },
  },
  {
    id: 'club', dimension: 'community', isDefault: false, mvp: false,
    features: [
      { key: 'event_management', mvp: true }, { key: 'community_feed', mvp: true },
      { key: 'discoverability', mvp: true }, { key: 'custom_broadcasts', mvp: true },
      { key: 'priority_support', mvp: true }, { key: 'jammer_plus_included', mvp: true },
      { key: 'multiple_communities', mvp: false }, { key: 'staff_accounts', mvp: false },
      { key: 'api_access', mvp: false }, { key: 'tournament_management', mvp: false },
    ],
    limits: { members_per_community: null, groups_per_community: null, recurring_events: null, co_organizers: null },
  },
];

export const MVP_FEATURES: ReadonlySet<string> = new Set(
  PLAN_MATRIX.flatMap((p) => p.features.filter((f) => f.mvp).map((f) => f.key)),
);
export const isMvpFeature = (key: string): boolean => MVP_FEATURES.has(key);
