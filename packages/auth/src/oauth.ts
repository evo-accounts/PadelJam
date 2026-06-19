import type { TypedClient } from './client';

/**
 * Begin the Google web-OAuth handshake. Returns `{ data: { url, provider }, error }`;
 * the caller opens `data.url` in a browser and handles the redirect (skipBrowserRedirect).
 */
export const startGoogleOAuth = (c: TypedClient, redirectTo: string) =>
  c.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });

/** Exchange the `?code=` from the OAuth redirect for a session (PKCE). */
export const exchangeCodeForSession = (c: TypedClient, code: string) =>
  c.auth.exchangeCodeForSession(code);

/** Begin the Apple web-OAuth handshake (Android path). */
export const startAppleOAuth = (c: TypedClient, redirectTo: string) =>
  c.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo, skipBrowserRedirect: true },
  });

/** Establish a session from a native Apple ID token (iOS path). `nonce` is the RAW nonce
 * whose SHA-256 hash was passed to AppleAuthentication.signInAsync. */
export const signInWithAppleIdToken = (c: TypedClient, token: string, nonce: string) =>
  c.auth.signInWithIdToken({ provider: 'apple', token, nonce });
