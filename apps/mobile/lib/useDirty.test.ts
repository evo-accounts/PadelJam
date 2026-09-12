import { describe, expect, it } from 'vitest';
import { isDirty } from './useDirty';

describe('isDirty', () => {
  it('is false when every field equals its initial value', () => {
    expect(isDirty({ name: 'a', bio: '' }, { name: 'a', bio: '' })).toBe(false);
  });
  it('is true when any field changed', () => {
    expect(isDirty({ name: 'a', bio: 'x' }, { name: 'a', bio: '' })).toBe(true);
  });
  it('treats null, undefined and empty string as the same emptiness', () => {
    expect(isDirty({ bio: '' }, { bio: null })).toBe(false);
    expect(isDirty({ bio: undefined }, { bio: '' })).toBe(false);
  });
});
