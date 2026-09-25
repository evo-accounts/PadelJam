import { describe, it, expect } from 'vitest';
import { notificationRoute } from './notification-route';

describe('notificationRoute', () => {
  it('routes event/group/community by id', () => {
    expect(notificationRoute({ event_id: 'e1' })).toBe('/event/e1');
    expect(notificationRoute({ group_id: 'g1' })).toBe('/group/g1');
    expect(notificationRoute({ community_id: 'c1' })).toBe('/community/c1');
  });
  it('routes a follow to the actor profile', () => {
    expect(notificationRoute({ type: 'follow', actor_id: 'u1' })).toBe('/profile/u1');
  });
  it('returns null for a follow without an actor', () => {
    expect(notificationRoute({ type: 'follow' })).toBeNull();
  });
  it('opens a group invitation on its invitation screen', () => {
    expect(notificationRoute({ type: 'group_invite', group_id: 'g1' })).toBe('/group/g1/join');
  });

  it('prefers event over group over community', () => {
    expect(notificationRoute({ event_id: 'e1', group_id: 'g1', community_id: 'c1' })).toBe('/event/e1');
  });
  it('returns null for an empty / unknown payload', () => {
    expect(notificationRoute({})).toBeNull();
    expect(notificationRoute({ type: 'mystery' })).toBeNull();
  });
});
