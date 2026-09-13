import { describe, expect, it } from 'vitest';

import { planSectionView } from './planSection';

describe('planSectionView', () => {
  it('shows Starter as current with an upgrade action', () => {
    const v = planSectionView('starter');
    expect(v.left.id).toBe('starter');
    expect(v.leftCurrent).toBe(true);
    expect(v.proCurrent).toBe(false);
    expect(v.action).toBe('upgrade');
  });

  it('shows the Basic plan and its own limits as current, still upgradable', () => {
    const v = planSectionView('basic');
    expect(v.left.id).toBe('basic');
    expect(v.left.limits?.groups_per_community).toBe(3);
    expect(v.leftCurrent).toBe(true);
    expect(v.proCurrent).toBe(false);
    expect(v.action).toBe('upgrade');
  });

  it('marks Community Pro current and offers Starter on the left as the way back', () => {
    const v = planSectionView('community_pro');
    expect(v.left.id).toBe('starter');
    expect(v.leftCurrent).toBe(false);
    expect(v.proCurrent).toBe(true);
    expect(v.action).toBe('downgrade');
  });

  it('shows Club as current with no self-serve action', () => {
    const v = planSectionView('club');
    expect(v.left.id).toBe('club');
    expect(v.leftCurrent).toBe(true);
    expect(v.action).toBeNull();
  });

  it('falls back to Starter for unknown or missing plans', () => {
    expect(planSectionView(null).left.id).toBe('starter');
    expect(planSectionView(undefined).action).toBe('upgrade');
    expect(planSectionView('enterprise').left.id).toBe('starter');
  });

  it('maps every community plan to a title key', () => {
    for (const id of ['starter', 'basic', 'community_pro', 'club']) {
      expect(planSectionView(id).left.id === 'starter' || planSectionView(id).leftTitleKey).toBeTruthy();
    }
    expect(planSectionView('basic').leftTitleKey).toBe('planBasic');
    expect(planSectionView('club').leftTitleKey).toBe('planClub');
    expect(planSectionView('community_pro').leftTitleKey).toBe('planStarter');
  });
});
