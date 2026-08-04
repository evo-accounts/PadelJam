/**
 * After a successful OTP/password verification, the profile lookup decides the
 * route: onboarded profile → tabs, not-onboarded profile → first unanswered
 * onboarding step (Requirements/auth-onboarding.md §03 — same resolution Boot
 * uses in postAuthRoute), no profile → create-account. A FAILED lookup must NOT
 * be treated as "no profile" (which silently sent existing users to
 * create-account on a transient backend error — observed in the post-OTP
 * bounce investigation, bounce-repro iter 7).
 */
import { describe, expect, it } from 'vitest';
import { decidePostVerifyRoute, type OnboardingProfile } from './postVerifyRoute';

const profile = (overrides: Partial<OnboardingProfile> = {}): OnboardingProfile => ({
  onboarded_at: null,
  location_text: null,
  dominant_hand: null,
  court_side: null,
  notifications_prompted_at: null,
  ...overrides,
});

describe('decidePostVerifyRoute', () => {
  it('routes to tabs when the profile is onboarded', () => {
    expect(decidePostVerifyRoute(profile({ onboarded_at: '2026-07-01T00:00:00Z' }), null)).toEqual({
      kind: 'route',
      target: '/(tabs)',
    });
  });

  it('routes a not-onboarded user to the first unanswered step, in order', () => {
    expect(decidePostVerifyRoute(profile(), null)).toEqual({
      kind: 'route',
      target: '/(onboarding)/location',
    });
    expect(decidePostVerifyRoute(profile({ location_text: 'Lisboa' }), null)).toEqual({
      kind: 'route',
      target: '/(onboarding)/hand',
    });
    expect(
      decidePostVerifyRoute(profile({ location_text: 'Lisboa', dominant_hand: 'right' }), null),
    ).toEqual({ kind: 'route', target: '/(onboarding)/side' });
    // The notifications step used to be absent from this sequence entirely
    // (UX-AUTH-03): the forward path reached it, but a user who quit after the
    // side step resumed straight at jammer-plus and was never asked.
    expect(
      decidePostVerifyRoute(
        profile({ location_text: 'Lisboa', dominant_hand: 'right', court_side: 'left' }),
        null,
      ),
    ).toEqual({ kind: 'route', target: '/(onboarding)/notifications' });
    expect(
      decidePostVerifyRoute(
        profile({
          location_text: 'Lisboa',
          dominant_hand: 'right',
          court_side: 'left',
          notifications_prompted_at: '2026-08-04T00:00:00Z',
        }),
        null,
      ),
    ).toEqual({ kind: 'route', target: '/(onboarding)/jammer-plus' });
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
