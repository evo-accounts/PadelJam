import { describe, it, expect } from 'vitest';
import { shouldResetCache } from './cache-reset';

describe('shouldResetCache', () => {
  it('does not reset on the first observation (app boot)', () => {
    expect(shouldResetCache(undefined, 'user-a')).toBe(false);
    expect(shouldResetCache(undefined, null)).toBe(false);
  });
  it('resets when a signed-in user signs out', () => {
    expect(shouldResetCache('user-a', null)).toBe(true);
  });
  it('resets when the user switches', () => {
    expect(shouldResetCache('user-a', 'user-b')).toBe(true);
  });
  it('resets when a signed-out session signs in (stale anonymous cache)', () => {
    expect(shouldResetCache(null, 'user-a')).toBe(true);
  });
  it('does not reset on token refresh (same uid)', () => {
    expect(shouldResetCache('user-a', 'user-a')).toBe(false);
  });
});
