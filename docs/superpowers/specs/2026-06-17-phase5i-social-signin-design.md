# Phase 5I — Social Sign-in (Google) — Design

*Padel Jam • 2026-06-17 • Brainstormed design / spec*

## Goal

Add **Continue with Google** sign-in via Supabase Auth web-OAuth, and route social sign-up through the
Create-account screen with email + name pre-filled/disabled (phone + password still required). Closes the
Google portion of **AU-08** and **AU-09**. Final slice of Phase 5.

**This is a scaffold:** it cannot be runtime-verified in this environment (no Google credentials; native
OAuth needs a dev build). It ships typecheck-clean code + a documented setup/verify guide; the actual
handshake is verified later on a dev build with real credentials.

## Scope decisions (from the 5I brainstorm)

1. **Google first; Apple deferred.** Apple (button + `expo-apple-authentication` + `signInWithIdToken`,
   paid Apple Developer account, App-Store-rule implications) is a documented follow-up.
2. **Supabase web OAuth** (`signInWithOAuth` → `expo-web-browser` → `exchangeCodeForSession`). **No new
   dependency** — `expo-web-browser` and `expo-linking` are already installed; **no native rebuild** for
   Google.
3. **Full happy-path scaffold:** config + helpers + buttons + AU-09 create-account pre-fill + new-vs-
   existing routing + a setup/verify doc.

## Verified context

- `[auth.external.apple]` exists **disabled** in `config.toml`; there is **no** `[auth.external.google]`
  block. `[auth] enable_manual_linking = true`. App scheme is `mobile` (`app.json`), bundle id
  `com.anonymous.mobile`.
- `@padel/auth` ([packages/auth/src](../../../packages/auth/src)): `client.ts` (`createAuthClient` with
  `detectSessionInUrl:false`, secure-store storage), `otp.ts`, `password.ts`, `session.ts`,
  `context.tsx` (`SessionProvider` subscribes to `onAuthStateChange`). Helpers are thin wrappers over
  `c.auth.*`. The mobile client is `apps/mobile/lib/supabase.ts` (secure-store storage).
- `(auth)/sign-in.tsx` is identifier-first (single input → OTP); the Continue button is the slot for a
  social row. `(auth)/otp.tsx` has a "Try another way" sheet (password / different identifier) — the slot
  for a Google option. `(auth)/create-account.tsx` collects the *secondary* identifier + full name +
  password + a terms checkbox, then calls the `complete-account` edge function.
- `_layout.tsx` `resolve()`: with a session it reads `profiles` and routes onboarded→`(tabs)`, else to the
  first unanswered onboarding step. **Bug:** a session with **no profiles row** falls through to
  onboarding, skipping create-account (phone+password). New OAuth users (and OTP users interrupted before
  completing) hit this.
- `expo-web-browser`, `expo-linking`, `expo-secure-store`, `@supabase/supabase-js@^2` are present.
- AU-08 (*Must*): "Continue with Google and Continue with Apple are available on the identifier-first
  screen and inside Try another way." (Supabase Auth OAuth.)
- AU-09 (*Must*): "Social sign-up routes through Create your account with email + name pre-filled and
  disabled; phone + password are still required."
- §5.6: existing-email → link + go Home; no account → create-account pre-filled; relay/conflict email →
  inline error (this conflict edge case is deferred).

## Architecture

### 1. Supabase config (`infra/supabase/config.toml`)

- Add a **disabled** Google provider block (kept disabled so local `supabase start` works without creds):
  ```toml
  [auth.external.google]
  enabled = false
  client_id = ""
  secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
  ```
- Add the mobile redirect URL to `additional_redirect_urls`: append `"mobile://auth/callback"`.
- Leave `[auth.external.apple]` untouched (still disabled).

### 2. `@padel/auth` — `packages/auth/src/oauth.ts`

Platform-agnostic supabase wrappers (the browser dance lives in the mobile app):
```ts
import type { TypedClient } from './client';

/** Begin the Google web-OAuth handshake; returns the provider auth URL (browser opened by the caller). */
export const startGoogleOAuth = (c: TypedClient, redirectTo: string) =>
  c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });

/** Exchange the `?code=` returned to the redirect URL for a session (PKCE). */
export const exchangeCodeForSession = (c: TypedClient, code: string) =>
  c.auth.exchangeCodeForSession(code);
```
Export both from `packages/auth/src/index.ts`. (`TypedClient` is the existing exported client type.)

### 3. Mobile orchestration — `apps/mobile/lib/googleSignIn.ts`

```ts
// runGoogleSignIn(): opens the system browser, completes the OAuth handshake, sets the session.
// Returns 'signed_in' on success; throws an Error(code) the caller maps via i18n.
//   redirectTo = Linking.createURL('auth/callback')  -> 'mobile://auth/callback'
//   const { data, error } = await startGoogleOAuth(supabase, redirectTo)
//   const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
//   if res.type !== 'success' -> throw 'oauth_cancelled'
//   const code = new URL(res.url).searchParams.get('code')  (parse via expo-linking/URL)
//   const { error } = await exchangeCodeForSession(supabase, code)
//   SessionProvider picks up the new session via onAuthStateChange.
```
`WebBrowser.maybeCompleteAuthSession()` is called at module load (standard expo-web-browser requirement).

### 4. Post-auth routing helper — `apps/mobile/lib/postAuthRoute.ts`

A shared `resolvePostAuth(supabase)` returning the target route from the current session:
- no session → `'/(auth)/sign-in'`
- session + profile.onboarded_at → `'/(tabs)'`
- session + profile present but not onboarded → the first unanswered onboarding step (as today)
- **session + NO profile row → `'/(auth)/create-account'`** (the fix; covers OAuth-new + OTP-interrupted)

`_layout.tsx` `resolve()` is refactored to use this (or the same null-profile branch is added inline), and
`runGoogleSignIn`'s caller navigates with the same helper after `exchangeCodeForSession`.

### 5. UI (AU-08 — Google)

- **`(auth)/sign-in.tsx`**: below Continue, an "or" divider + a **"Continue with Google"** button
  (`onPress` → `runGoogleSignIn` wrapped in a busy/try-catch that maps errors to i18n, then
  `router.replace(await resolvePostAuth(supabase))`).
- **`(auth)/otp.tsx`** "Try another way" sheet: add a **"Continue with Google"** row with the same handler.

### 6. AU-09 — `(auth)/create-account.tsx` social pre-fill

- Detect a social session: `session.user` exists, `session.user.email` is set, and there is **no profile
  yet** (or the user has no phone) — i.e. the user arrived via OAuth. Use `session.user.app_metadata.provider`
  (`'google'`) and/or the presence of `email` + absence of a completed profile.
- When social: **pre-fill and disable** the email field (`session.user.email`) and the full-name field
  (`session.user.user_metadata.full_name ?? user_metadata.name`); require **phone + password**; the terms
  checkbox still gates Continue. Submit through the existing `complete-account` edge function (which attaches
  the phone + password and creates the `profiles` row on the same `auth.users`).
- Non-social create-account is unchanged.

### 7. Env + docs

- `.env.example` (root and/or `infra`): add `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=` and
  `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=` (server-side, for Supabase). The mobile app needs no client
  id (Supabase brokers the web OAuth).
- **`docs/superpowers/5i-social-signin-setup.md`**: step-by-step — create a Google Cloud OAuth **web**
  client; set the Supabase callback as the authorized redirect URI; set the two env vars + flip
  `[auth.external.google].enabled = true`; ensure `"mobile://auth/callback"` is an allowed redirect; build a
  dev client (`expo run:ios`); test the button → Google → returns to the app → create-account (new) or Home
  (existing). Note Apple's deferred setup.

## i18n (`mobileAuth` namespace)

`continueWithGoogle` ("Continue with Google"), `orDivider` ("or"), `oauth_cancelled` ("Sign-in was
cancelled."), `oauth_failed` ("Couldn't sign in with Google. Please try again."), plus AU-09 labels if any
new copy is needed for the disabled prefilled fields (reuse existing email/name labels).

## Error handling

- `runGoogleSignIn` throws stable codes (`oauth_cancelled`, `oauth_failed`, `unknown_error`) mapped to the
  auth i18n namespace and shown inline on the sign-in screen.
- A returned redirect URL with `error`/no `code` → `oauth_failed`.
- The §5.6 relay-email conflict (provider email already linked to a different identity) is **deferred**;
  the basic path is existing-profile→Home, no-profile→create-account.
- Provider disabled locally (`enabled=false`) → `signInWithOAuth` errors; the button surfaces `oauth_failed`
  until credentials are configured (expected pre-setup).

## Testing / verification

- **Typecheck:** `pnpm -w typecheck` (13/13) — the only automated gate for this slice.
- **No migration / no SQL test / no api unit test** (auth is Supabase-managed; the new code is RN-only
  orchestration + thin wrappers).
- **Manual (post-credentials, dev build), per the setup doc:** Google button → browser → consent → returns
  to `mobile://auth/callback` → new user lands on create-account with email+name disabled and completes with
  phone+password → Home; an existing-email user lands on Home directly.

## Explicitly deferred (documented follow-ups)

Apple sign-in (button, `expo-apple-authentication`, `signInWithIdToken`, Apple Developer setup, App-Store
rule); the relay/duplicate-email conflict handling (§5.6); production redirect-URL allow-listing; PT/PT-BR
copy.

## Conventions followed

`config.toml` env-interpolated secrets; thin `@padel/auth` wrappers over `c.auth.*` (mirrors
`otp.ts`/`password.ts`); mobile RN orchestration in `apps/mobile/lib`; `useT('auth')`; reuse the existing
`SessionProvider`, `complete-account` edge function, secure-store storage, and the `expo-web-browser`
pattern. No new dependency; no migration.
