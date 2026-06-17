import { supabase } from '@/lib/supabase';

/**
 * The route to land on given the current session:
 *  - no session                -> sign-in
 *  - session, no profile row    -> create-account (social-new or OTP-interrupted; AU-09)
 *  - session, onboarded         -> tabs
 *  - session, not onboarded     -> the first unanswered onboarding step
 */
export async function resolvePostAuthRoute(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return '/(auth)/sign-in';

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded_at, location_text, dominant_hand, court_side')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profile) return '/(auth)/create-account';
  if (profile.onboarded_at) return '/(tabs)';
  if (!profile.location_text) return '/(onboarding)/location';
  if (!profile.dominant_hand) return '/(onboarding)/hand';
  if (!profile.court_side) return '/(onboarding)/side';
  return '/(onboarding)/jammer-plus';
}
