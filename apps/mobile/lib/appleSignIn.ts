import { exchangeCodeForSession, signInWithAppleIdToken, startAppleOAuth } from '@padel/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { assertNoSocialEmailConflict } from '@/lib/socialConflict';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

async function randomNonce(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isIdentityConflict(error: { message?: string; status?: number } | null): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return error?.status === 422 || m.includes('already') || m.includes('exists');
}

/** Drive Sign in with Apple: native sheet on iOS, web-OAuth on Android. Throws Error(<i18n code>) on failure. */
export async function runAppleSignIn(): Promise<void> {
  if (Platform.OS === 'ios') {
    const rawNonce = await randomNonce();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let cred: AppleAuthentication.AppleAuthenticationCredential;
    try {
      cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') throw new Error('oauth_cancelled');
      throw new Error('oauth_failed');
    }
    if (!cred.identityToken) throw new Error('oauth_failed');
    const { error } = await signInWithAppleIdToken(supabase, cred.identityToken, rawNonce);
    if (error) throw new Error(isIdentityConflict(error) ? 'email_conflict' : 'oauth_failed');
    // Apple returns the name only on first sign-in — persist it so create-account prefill works.
    const full = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
    if (full) await supabase.auth.updateUser({ data: { full_name: full } });
  } else {
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await startAppleOAuth(supabase, redirectTo);
    if (error || !data?.url) throw new Error('oauth_failed');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) throw new Error('oauth_cancelled');
    const { queryParams } = Linking.parse(result.url);
    const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
    if (!code) throw new Error('oauth_failed');
    const { error: exErr } = await exchangeCodeForSession(supabase, code);
    if (exErr) throw new Error(isIdentityConflict(exErr) ? 'email_conflict' : 'oauth_failed');
  }
  await assertNoSocialEmailConflict();
}
