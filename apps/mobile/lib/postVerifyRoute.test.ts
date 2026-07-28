/**
 * After a successful OTP/password verification, the profile lookup decides the
 * route: profile → tabs, no profile → create-account. A FAILED lookup must NOT
 * be treated as "no profile" (which silently sent existing users to
 * create-account on a transient backend error — observed in the post-OTP
 * bounce investigation, bounce-repro iter 7).
 */
import { describe, expect, it } from 'vitest';
import { decidePostVerifyRoute } from './postVerifyRoute';

describe('decidePostVerifyRoute', () => {
  it('routes to tabs when a profile exists', () => {
    expect(decidePostVerifyRoute({ id: 'u1' }, null)).toEqual({
      kind: 'route',
      target: '/(tabs)',
    });
  });

  it('routes to create-account when no profile row exists', () => {
    expect(decidePostVerifyRoute(null, null)).toEqual({
      kind: 'route',
      target: '/(auth)/create-account',
    });
  });

  it('surfaces a failed profile lookup as an error instead of misrouting', () => {
    expect(decidePostVerifyRoute(null, { message: 'network request failed' })).toEqual({
      kind: 'error',
      message: 'network request failed',
    });
  });
});
