import { onboardingRoute } from '@/lib/postVerifyRoute';
import { provisionSocialProfile } from '@/lib/provisionSocialProfile';
import { supabase } from '@/lib/supabase';

const SOCIAL_PROVIDERS = ['apple', 'google'];

function isSocialSession(session: {
  user: { app_metadata?: { provider?: string; providers?: string[] } };
}): boolean {
  // Mirror provision-social-profile: check both `provider` (original signup
  // method) and `providers` (all linked identities) — Supabase auto-linking
  // keeps provider='email' after Apple/Google is linked.
  const meta = session.user.app_metadata ?? {};
  const provider = meta.provider ?? '';
  const providers = meta.providers ?? [];
  return (
    SOCIAL_PROVIDERS.includes(provider) ||
    providers.some((p) => SOCIAL_PROVIDERS.includes(p))
  );
}

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('onboarded_at, location_text, dominant_hand, court_side')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * The route to land on given the current session:
 *  - no session                          -> sign-in
 *  - session, no profile, social user    -> re-attempt provision, then onboarding (safety net)
 *  - session, no profile, OTP user       -> create-account
 *  - session, onboarded                  -> tabs
 *  - session, not onboarded              -> first unanswered onboarding step
 */
export async function resolvePostAuthRoute(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return '/(auth)/sign-in';

  let profile = await fetchProfile(session.user.id);

  if (!profile) {
    if (isSocialSession(session)) {
      // Provision may have failed before routing (network error). Retry once — it is idempotent.
      try {
        await provisionSocialProfile(session.access_token, undefined);
        profile = await fetchProfile(session.user.id);
      } catch {
        // Provision failed again — fall through to create-account as last resort.
      }
    }
    if (!profile) return '/(auth)/create-account';
  }

  return onboardingRoute(profile);
}
