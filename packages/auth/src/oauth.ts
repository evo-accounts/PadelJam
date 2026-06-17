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
