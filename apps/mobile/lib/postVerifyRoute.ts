/**
 * Routing decision after a successful credential verification (OTP or password):
 * profile row → tabs; no row → create-account. A FAILED lookup is surfaced as
 * an error instead of being conflated with "no profile" — a transient backend
 * error here otherwise sends an existing user into account creation.
 */
export type PostVerifyDecision =
  | { kind: 'route'; target: '/(tabs)' | '/(auth)/create-account' }
  | { kind: 'error'; message: string };

export function decidePostVerifyRoute(
  profile: { id: string } | null,
  error: { message: string } | null,
): PostVerifyDecision {
  if (error) return { kind: 'error', message: error.message };
  return { kind: 'route', target: profile ? '/(tabs)' : '/(auth)/create-account' };
}
