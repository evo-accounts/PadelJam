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
});
