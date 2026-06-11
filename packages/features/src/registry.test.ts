import { describe, it, expect } from 'vitest';
import { PLAN_MATRIX, isMvpFeature, COMMUNITY_FEATURES, LIMIT_KEYS } from './registry';

describe('registry', () => {
  it('marks starter as the default community plan with a members limit of 10', () => {
    const starter = PLAN_MATRIX.find((p) => p.dimension === 'community' && p.id === 'starter');
    expect(starter?.isDefault).toBe(true);
    expect(starter?.limits?.members_per_community).toBe(10);
  });
  it('treats unlimited (club groups) as null', () => {
    const club = PLAN_MATRIX.find((p) => p.id === 'club');
    expect(club?.limits?.groups_per_community).toBeNull();
  });
  it('enforces advanced_stats (mvp) but not match_insights (next)', () => {
    expect(isMvpFeature('advanced_stats')).toBe(true);
    expect(isMvpFeature('match_insights')).toBe(false);
  });
  it('exposes the four community limit keys', () => {
    expect([...LIMIT_KEYS].sort()).toEqual(
      ['co_organizers', 'groups_per_community', 'members_per_community', 'recurring_events'].sort(),
    );
    expect(COMMUNITY_FEATURES).toContain('custom_broadcasts');
  });
});
