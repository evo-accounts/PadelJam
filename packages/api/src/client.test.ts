// packages/api/src/client.test.ts
import { describe, expect, it } from 'vitest';
import { mapPgError } from './client';

describe('mapPgError', () => {
  it('maps the last-active-group archive guard', () => {
    expect(mapPgError({ message: 'last_active_group' })).toBe('last_active_group');
  });
  it('falls back to unknown_error', () => {
    expect(mapPgError({ message: 'something else entirely' })).toBe('unknown_error');
  });
  it('returns null for no error', () => {
    expect(mapPgError(null)).toBeNull();
  });
  it('maps the mixed start guards', () => {
    expect(mapPgError({ message: 'mixed_unbalanced' })).toBe('mixed_unbalanced');
    expect(mapPgError({ message: 'mixed_gender_missing' })).toBe('mixed_gender_missing');
  });
  it('maps the waiting-list claim codes', () => {
    expect(mapPgError({ message: 'not_on_waiting_list' })).toBe('not_on_waiting_list');
    expect(mapPgError({ message: 'spot_taken' })).toBe('spot_taken');
  });
  it('maps the partner-request codes (0111)', () => {
    expect(mapPgError({ message: 'request_stale' })).toBe('request_stale');
    expect(mapPgError({ message: 'partner_unavailable' })).toBe('partner_unavailable');
  });
  it('maps the follow and community-location codes (0128)', () => {
    expect(mapPgError({ message: 'cannot_follow_self' })).toBe('cannot_follow_self');
    expect(mapPgError({ message: 'blocked' })).toBe('blocked');
    expect(mapPgError({ message: 'invalid_location' })).toBe('invalid_location');
  });
  it('maps the plan grant/downgrade guard codes', () => {
    expect(mapPgError({ message: 'invalid_plan' })).toBe('invalid_plan');
    expect(mapPgError({ message: 'plan_downgrade_over_limit' })).toBe('plan_downgrade_over_limit');
  });

  it('maps the manage-rules codes (0122), longest match first', () => {
    for (const code of ['not_enough_players', 'odd_players', 'teams_incomplete', 'invalid_rounds',
      'waitlist_not_confirmable', 'team_required', 'starts_at_required', 'starts_at_in_past',
      'invites_not_allowed', 'not_group_member', 'user_not_found', 'slot_taken',
      'standalone_must_be_private', 'blocked']) {
      expect(mapPgError({ message: code })).toBe(code);
    }
    expect(mapPgError({ message: 'player_gender_required' })).toBe('player_gender_required');
    expect(mapPgError({ message: 'gender_required' })).toBe('gender_required');
  });

  it('maps the recurrence-occurrence codes (0123)', () => {
    for (const code of ['occurrence_not_found', 'occurrence_materialised', 'occurrence_cancelled',
      'occurrence_conflict']) {
      expect(mapPgError({ message: code })).toBe(code);
    }
  });

  it('maps the weak-password rejection', () => {
    expect(mapPgError({ message: 'password_weak' })).toBe('password_weak');
  });
});
