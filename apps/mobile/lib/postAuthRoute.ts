import { provisionSocialProfile } from '@/lib/provisionSocialProfile';
import { supabase } from '@/lib/supabase';

const SOCIAL_PROVIDERS = ['apple', 'google'];

function isSocialSession(session: { user: { app_metadata?: { provider?: string } } }): boolean {
  const provider = session.user.app_metadata?.provider ?? '';
  return SOCIAL_PROVIDERS.includes(provider);
}

async function fetchProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('onboarded_at, location_text, dominant_hand, court_side')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

function onboardingRoute(profile: { onboarded_at: string | null; location_text: string | null; dominant_hand: string | null; court_side: string | null }): string {
  if (profile.onboarded_at) return '/(tabs)';
  if (!profile.location_text) return '/(onboarding)/location';
  if (!profile.dominant_hand) return '/(onboarding)/hand';
  if (!profile.court_side) return '/(onboarding)/side';
  return '/(onboarding)/jammer-plus';
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
