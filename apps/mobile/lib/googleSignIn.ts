import { exchangeCodeForSession, startGoogleOAuth } from '@padel/auth';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { provisionSocialProfile } from '@/lib/provisionSocialProfile';
import { assertNoSocialEmailConflict } from '@/lib/socialConflict';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Drive the Google web-OAuth handshake: open the system browser, capture the redirect,
 * and exchange the code for a session. Throws Error(<i18n code>) on failure.
 * On success the SessionProvider picks up the new session via onAuthStateChange.
 */
export async function runGoogleSignIn(): Promise<void> {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await startGoogleOAuth(supabase, redirectTo);
  if (error || !data?.url) throw new Error('oauth_failed');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) throw new Error('oauth_cancelled');

  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (!code) throw new Error('oauth_failed');

  const { error: exchangeError } = await exchangeCodeForSession(supabase, code);
  if (exchangeError) throw new Error('oauth_failed');

  // Provision the profile server-side. Google metadata includes full_name.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    try {
      await provisionSocialProfile(session.access_token);
    } catch {
      // Best-effort: postAuthRoute.ts retries provision if the profile row is missing.
    }
  }

  await assertNoSocialEmailConflict();
}
