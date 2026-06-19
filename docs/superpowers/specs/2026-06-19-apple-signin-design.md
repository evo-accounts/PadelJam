# Apple Sign-In + Duplicate-Email Conflict (B1, incl. B2 §5.6) — Design

*Padel Jam • 2026-06-19 • Brainstormed design / spec*

## Goal

Add "Sign in with Apple" (native on iOS, Supabase web-OAuth on Android) and the §5.6 duplicate-email conflict
handling for **both** social providers (Google + Apple). B1 is the critical-path item for the imminent iOS
release: per App Store rule 5.1.1, offering Google on iOS makes Apple sign-in mandatory. The native iOS flow is
the compliant solution; the conflict handling (folded-in B2) bounces a social sign-in whose email is already
owned by a different account.

## Scope decisions (from the brainstorm)

1. **Apple mechanism:** native `expo-apple-authentication` (`signInWithIdToken` + hashed nonce) on **iOS**;
   Supabase Apple **web-OAuth** (mirrors Google) on **Android**.
2. **Conflict (§5.6) scope:** applies to **both** Google and Apple social sign-ins.
3. **Conflict detection** is a param-less SECURITY DEFINER RPC (no email-enumeration surface) + client-side
   error mapping — locally SQL-testable; live OAuth verified on the dev build.

## Verified context

- **Google scaffold (the pattern):** `packages/auth/src/oauth.ts` (`startGoogleOAuth`, `exchangeCodeForSession`);
  `apps/mobile/lib/googleSignIn.ts` (`runGoogleSignIn`: `expo-web-browser` + `expo-linking` PKCE);
  `apps/mobile/lib/postAuthRoute.ts` (`resolvePostAuthRoute`); buttons on `apps/mobile/app/(auth)/sign-in.tsx`
  (~L105-112) + the OTP "Try another way" sheet `apps/mobile/app/(auth)/otp.tsx`; social prefill in
  `apps/mobile/app/(auth)/create-account.tsx` (reads `app_metadata.provider`, `user_metadata.full_name/name`).
- **`auth_providers` view** (`0003_profiles.sql`) already exposes `has_apple`; `profiles` has an `email` column.
- **config.toml** `[auth.external.apple]` exists (`enabled=false`, `secret=env(SUPABASE_AUTH_EXTERNAL_APPLE_SECRET)`)
  — mirrors the locally-disabled Google block; `mobile://auth/callback` is allow-listed.
- **A5 parity test** (`apps/mobile/lib/i18n-mobile.test.ts`) guards the `auth` namespace → new keys MUST be added
  in pt-PT, pt-BR, en.
- Highest migration is **`0082`**; this slice uses **`0083`**.

## Architecture

### 1. Migration `0083_social_email_conflict.sql`

```sql
-- §5.6: detect a social sign-in whose email is already owned by a DIFFERENT account.
-- Param-less (uses the caller's own session email) so it can't be used to enumerate other emails.
create or replace function social_email_conflict() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles p
    join auth.users u on u.id = p.id
    where u.id <> auth.uid()
      and lower(u.email) = lower((select email from auth.users where id = auth.uid()))
      and (select email from auth.users where id = auth.uid()) is not null
  );
$$;
grant execute on function social_email_conflict() to authenticated;
```
- `database.types.ts`: add `social_email_conflict: { Args: Record<string, never>; Returns: boolean }`.
- **SQL test** `infra/supabase/tests/social_email_conflict.sql`: seed users A and B; give A a `profiles` row whose
  `auth.users.email` = X; as B with the same email X → `social_email_conflict()` is **true**; as A (sole owner)
  → **false**; a user whose email matches nobody else → **false**. (Matching is on `auth.users.email`, which is
  what Supabase populates from the provider; `profiles.email` is set at account creation.)

> Note on matching column: the check joins `profiles` to `auth.users` and compares `auth.users.email` (the
> authoritative provider email). If the fixtures show `profiles.email` is the reliable field instead, the
> implementer adjusts the comparison to `p.email` — the test pins the intended behavior either way.

### 2. `@padel/auth` (`packages/auth/src/oauth.ts`)

```ts
export const startAppleOAuth = (c: TypedClient, redirectTo: string) =>
  c.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo, skipBrowserRedirect: true } });

export const signInWithAppleIdToken = (c: TypedClient, token: string, nonce: string) =>
  c.auth.signInWithIdToken({ provider: 'apple', token, nonce });
```
(`exchangeCodeForSession` already exported.)

### 3. Mobile — `apps/mobile/lib/appleSignIn.ts`

- **`runAppleSignIn()`** (entry; platform-split):
  - **iOS:** `const raw = <random>; const hashed = await Crypto.digestStringAsync(SHA256, raw);`
    `const cred = await AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL], nonce: hashed });`
    `await signInWithAppleIdToken(supabase, cred.identityToken!, raw);` then if `cred.fullName` present (first
    sign-in only) `await supabase.auth.updateUser({ data: { full_name: <joined name> } })` so create-account's
    existing `socialName` prefill works. Map `ERR_REQUEST_CANCELED` → throw `'oauth_cancelled'`, else
    `'oauth_failed'`.
  - **Android:** mirror `runGoogleSignIn` using `startAppleOAuth` + `WebBrowser.openAuthSessionAsync` +
    `exchangeCodeForSession`.
- **After session (both providers):** call the shared conflict guard (below) before routing.

### 4. Conflict guard (shared by Google + Apple)

- Add to `apps/mobile/lib/` a small `assertNoSocialEmailConflict()` used by both `runGoogleSignIn` and
  `runAppleSignIn` after the session is established:
  ```ts
  const { data: conflict } = await supabase.rpc('social_email_conflict');
  if (conflict) { await supabase.auth.signOut(); throw new Error('email_conflict'); }
  ```
- Also wrap the OAuth/idToken calls so a Supabase identity/email-exists error is re-thrown as `'email_conflict'`
  (covers the exchange-error path).
- The `onGoogle`/`onApple` handlers in `sign-in.tsx`/`otp.tsx` already `catch (e) => setError(t(e.message))`; with
  `email_conflict` mapped in i18n, the inline message renders and the user stays on 5.1.

### 5. Auth screens

- `sign-in.tsx` + `otp.tsx`: add a "Continue with Apple" affordance next to Google.
  - **iOS:** render `AppleAuthentication.AppleAuthenticationButton` (native black button), gated by
    `Platform.OS === 'ios' && isAvailable` (`AppleAuthentication.isAvailableAsync()`), `onPress = onApple`.
  - **Android:** a styled button (matching the Google button) → `onApple` (web flow).
- `onApple` mirrors `onGoogle`: `await runAppleSignIn(); router.replace(await resolvePostAuthRoute());` catch →
  `setError(t(e.message))`.

### 6. Deps + config

- `npx expo install expo-apple-authentication expo-crypto` (SDK-56-aligned).
- `app.json`: add `"expo-apple-authentication"` to `plugins`; add `"usesAppleSignIn": true` under `ios`.
- `config.toml` `[auth.external.apple]` stays `enabled=false` locally (mirrors Google); enabling it with the real
  Services ID + key/secret is in the runbook (your Apple Developer console + Supabase provider).
- i18n (`auth` namespace, **pt-PT + pt-BR + en**, parity-test-required): `continueWithApple`,
  `email_conflict` ("This email is already linked to a different sign-in. Use that one instead.").

## Error handling

- `oauth_cancelled` (user dismissed the Apple sheet / browser) → silent return / inline, like Google.
- `email_conflict` → sign out + inline §5.6 message + remain on sign-in.
- Native module absent (Android / Expo Go) → the iOS-only native button never renders (Platform + isAvailable
  gate); the Android web button path doesn't import the native API at call time.

## Testing / verification

- **DB:** `db reset` clean through `0083`; `social_email_conflict.sql` → `OK social_email_conflict`.
- **Types/API/i18n:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`; `pnpm --filter mobile test`
  (i18n parity stays green with the new `auth` keys in all three locales).
- **On dev build (gated — your EAS iOS build + Apple Developer setup + enabled Supabase provider):** native
  Apple sheet → session → routing for new (→ create-account prefilled with Apple name) / returning (→ Home) /
  conflict (→ inline + bounce); Android web-Apple; Google conflict case.

## Conventions followed

Additive migration `0083`; SECURITY DEFINER RPC + grant; SQL test `PT001`/`OK`; `@padel/auth` wrappers mirroring
Google; reuse `resolvePostAuthRoute`/create-account prefill; platform-gated native module; new i18n keys in all
locales (A5 parity); providers stay local-disabled in `config.toml` (prod-enabled via runbook).

## Out of scope

Production redirect-URL allow-listing; PT/PT-BR wording polish (keys present); account *merge/linking* UX beyond
the conflict bounce (§5.6 specifies bounce, not merge); B4 push; B3 image-card.
