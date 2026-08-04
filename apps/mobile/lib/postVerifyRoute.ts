/**
 * Routing decision after a successful credential verification (OTP or password):
 * onboarded profile → tabs; not-onboarded profile → first unanswered onboarding
 * step; no row → create-account. A FAILED lookup is surfaced as an error instead
 * of being conflated with "no profile" — a transient backend error here
 * otherwise sends an existing user into account creation.
 *
 * The step resolution is shared with Boot's resolvePostAuthRoute so a signed-in
 * user lands on the same screen whether routing runs post-verify or on relaunch.
 */
export type OnboardingProfile = {
  onboarded_at: string | null;
  location_text: string | null;
  dominant_hand: string | null;
  court_side: string | null;
  notifications_prompted_at: string | null;
};

export type OnboardingRoute =
  | '/(tabs)'
  | '/(onboarding)/location'
  | '/(onboarding)/hand'
  | '/(onboarding)/side'
  | '/(onboarding)/notifications'
  | '/(onboarding)/jammer-plus';

export function onboardingRoute(profile: OnboardingProfile): OnboardingRoute {
  if (profile.onboarded_at) return '/(tabs)';
  if (!profile.location_text) return '/(onboarding)/location';
  if (!profile.dominant_hand) return '/(onboarding)/hand';
  if (!profile.court_side) return '/(onboarding)/side';
  // Keyed on "was it shown", not on the permission result — the OS owns that,
  // and re-asking someone who declined is what UX-AUTH-03 objects to.
  if (!profile.notifications_prompted_at) return '/(onboarding)/notifications';
  return '/(onboarding)/jammer-plus';
}

export type PostVerifyDecision =
  | { kind: 'route'; target: OnboardingRoute | '/(auth)/create-account' }
  | { kind: 'error'; message: string };

export function decidePostVerifyRoute(
  profile: OnboardingProfile | null,
  error: { message: string } | null,
): PostVerifyDecision {
  if (error) return { kind: 'error', message: error.message };
  if (!profile) return { kind: 'route', target: '/(auth)/create-account' };
  return { kind: 'route', target: onboardingRoute(profile) };
}
