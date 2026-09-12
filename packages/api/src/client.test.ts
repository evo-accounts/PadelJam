// packages/api/src/client.test.ts
import { describe, expect, it } from 'vitest';
import { mapPgError } from './client';

describe('mapPgError', () => {
  it('maps the general-group archive guard', () => {
    expect(mapPgError({ message: 'general_group_only_group' })).toBe('general_group_only_group');
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
  it('maps the plan grant/downgrade guard codes', () => {
    expect(mapPgError({ message: 'invalid_plan' })).toBe('invalid_plan');
    expect(mapPgError({ message: 'plan_downgrade_over_limit' })).toBe('plan_downgrade_over_limit');
  });
});
