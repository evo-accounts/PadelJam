# Phase 5I — Social Sign-in (Google) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Continue-with-Google sign-in via Supabase web-OAuth and route social sign-up through Create-account with email+name pre-filled/disabled (phone+password still required).

**Architecture:** Thin `@padel/auth` wrappers (`startGoogleOAuth`/`exchangeCodeForSession`) + a mobile `googleSignIn.ts` that drives `expo-web-browser`; a shared `resolvePostAuthRoute` (also fixing the no-profile→create-account routing bug); "Continue with Google" on the sign-in + try-another-way screens; AU-09 prefill on create-account. Scaffold-only — typecheck-clean + a setup doc; the live handshake is verified later on a dev build with real credentials.

**Tech Stack:** Supabase Auth OAuth, expo-web-browser, expo-linking, React Native / Expo Router. No new dependency, no migration.

Spec: `docs/superpowers/specs/2026-06-17-phase5i-social-signin-design.md`.

**Verification note:** this slice cannot be runtime-verified here (no Google credentials; native browser flow needs a dev build). The automated gate is `pnpm -w typecheck`; runtime verification follows the setup doc on a dev build.

---

### Task 1: Supabase config + env + setup doc

**Files:**
- Modify: `infra/supabase/config.toml`
- Modify: `.env.example` (repo root) and `apps/mobile/.env.example` if present
- Create: `docs/superpowers/5i-social-signin-setup.md`

- [ ] **Step 1: Add the Google provider block (disabled) + redirect URL**

In `infra/supabase/config.toml`, near the existing `[auth.external.apple]` block, add:

```toml
[auth.external.google]
enabled = false
client_id = ""
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
```

And append the mobile redirect to `additional_redirect_urls` in the `[auth]` section (keep the existing
entries):

```toml
additional_redirect_urls = ["https://127.0.0.1:3000", "mobile://auth/callback"]
```

(`enabled = false` keeps local `supabase start` working without credentials.)

- [ ] **Step 2: Document the env vars**

In `.env.example` (root) add:
```
# Google OAuth (Supabase Auth external provider) — set + flip [auth.external.google].enabled=true to use
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 3: Write the setup/verify doc**

Create `docs/superpowers/5i-social-signin-setup.md` covering: (1) create a Google Cloud OAuth **web**
client; (2) add the Supabase auth callback (`<SUPABASE_URL>/auth/v1/callback`) as an authorized redirect
URI; (3) set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID/SECRET`, flip `[auth.external.google].enabled=true`,
ensure `mobile://auth/callback` is in `additional_redirect_urls`; (4) `cd apps/mobile && npx expo run:ios`
(dev build); (5) test: tap Continue with Google → consent → returns to the app → **new** user lands on
Create-account (email+name disabled) and completes with phone+password → Home; an **existing-email** user
lands on Home. Note Apple is a deferred follow-up (needs an Apple Developer account + `expo-apple-authentication`).

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/config.toml .env.example docs/superpowers/5i-social-signin-setup.md
git commit -m "chore(auth): scaffold Google OAuth provider config + setup doc (5I)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `@padel/auth` OAuth wrappers

**Files:**
- Create: `packages/auth/src/oauth.ts`
- Modify: `packages/auth/src/index.ts`

- [ ] **Step 1: Create the wrappers**

Create `packages/auth/src/oauth.ts` (mirror the thin-wrapper style of `otp.ts`/`password.ts`; `TypedClient`
is exported from `./client`):

```ts
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
```

- [ ] **Step 2: Export from the index**

In `packages/auth/src/index.ts`, add `export * from './oauth';` alongside the other re-exports.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm -w typecheck` (13/13). Confirm `TypedClient` is exported from `./client` (it is — used by
`otp.ts`). Then:
```bash
git add packages/auth/src/oauth.ts packages/auth/src/index.ts
git commit -m "feat(auth): startGoogleOAuth + exchangeCodeForSession wrappers (5I)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Post-auth routing helper + `_layout.tsx` fix

**Files:**
- Create: `apps/mobile/lib/postAuthRoute.ts`
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Create the routing helper**

Create `apps/mobile/lib/postAuthRoute.ts`:

```ts
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
```

- [ ] **Step 2: Use it in `_layout.tsx` `resolve()`**

In `apps/mobile/app/_layout.tsx`:
- Import: `import { resolvePostAuthRoute } from '@/lib/postAuthRoute';`
- Replace the `if (session?.user) { … }` block inside `resolve()` (the inline profile lookup, ~lines
  128-140) with:
  ```ts
      if (session?.user) {
        return (await resolvePostAuthRoute()) as Target;
      }
  ```
- Extend the `Target` type to include the create-account route. Find the `Target` type alias and add
  `| '/(auth)/create-account'` (alongside the onboarding-route strings). The final `else router.replace(target)`
  in `run()` already handles arbitrary href strings, so `'/(tabs)'`, `'/(auth)/create-account'`, and the
  onboarding routes all route correctly. (Note `resolvePostAuthRoute` returns `'/(tabs)'`, which hits that
  final `else` — confirm `router.replace('/(tabs)')` is reached, not the `'(tabs)'` special-case.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm -w typecheck` (13/13). Then:
```bash
git add apps/mobile/lib/postAuthRoute.ts "apps/mobile/app/_layout.tsx"
git commit -m "fix(auth): route session-without-profile to create-account (5I)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Google sign-in orchestration + buttons + i18n

**Files:**
- Create: `apps/mobile/lib/googleSignIn.ts`
- Modify: `apps/mobile/app/(auth)/sign-in.tsx`
- Modify: `apps/mobile/app/(auth)/otp.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Create the orchestration helper**

Create `apps/mobile/lib/googleSignIn.ts`:

```ts
import { exchangeCodeForSession, startGoogleOAuth } from '@padel/auth';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Drive the Google web-OAuth handshake: open the system browser, capture the redirect,
 * and exchange the code for a session. Throws Error(<i18n code>) on failure.
 * On success the SessionProvider picks up the new session via onAuthStateChange.
 */
export async function runGoogleSignIn(): Promise<void> {
  const redirectTo = Linking.createURL('auth/callback'); // mobile://auth/callback

  const { data, error } = await startGoogleOAuth(supabase, redirectTo);
  if (error || !data?.url) throw new Error('oauth_failed');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) throw new Error('oauth_cancelled');

  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (!code) throw new Error('oauth_failed');

  const { error: exchangeError } = await exchangeCodeForSession(supabase, code);
  if (exchangeError) throw new Error('oauth_failed');
}
```

- [ ] **Step 2: Add the button to the sign-in screen**

In `apps/mobile/app/(auth)/sign-in.tsx`:
- Imports: `import { runGoogleSignIn } from '@/lib/googleSignIn';`, `import { resolvePostAuthRoute } from '@/lib/postAuthRoute';`
- Add a handler:
  ```tsx
  const onGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await runGoogleSignIn();
      router.replace((await resolvePostAuthRoute()) as never);
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'oauth_failed'));
    } finally {
      setBusy(false);
    }
  };
  ```
- Below the Continue `Pressable`, add an "or" divider + the Google button:
  ```tsx
  <View style={styles.dividerRow}>
    <View style={styles.divider} />
    <Text style={styles.dividerText}>{t('orDivider')}</Text>
    <View style={styles.divider} />
  </View>
  <Pressable
    style={[styles.googleButton, busy && styles.buttonDisabled]}
    onPress={onGoogle}
    disabled={busy}
    accessibilityRole="button"
  >
    <Text style={styles.googleButtonText}>{t('continueWithGoogle')}</Text>
  </Pressable>
  ```
- Add styles:
  ```ts
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#ccc' },
  dividerText: { fontSize: 13, color: '#888' },
  googleButton: { borderWidth: 1, borderColor: '#ccc', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  googleButtonText: { color: '#0B1F3A', fontSize: 16, fontWeight: '600' },
  ```

- [ ] **Step 3: Add the option to the OTP "Try another way" sheet**

In `apps/mobile/app/(auth)/otp.tsx`, in the try-another-way sheet (alongside "Use password" / "Use different
identifier"), add a row that runs the same flow:
```tsx
<Pressable style={styles.sheetRow} onPress={onGoogle} accessibilityRole="button">
  <Text style={styles.sheetRowText}>{t('continueWithGoogle')}</Text>
</Pressable>
```
with an `onGoogle` handler identical to sign-in's (import `runGoogleSignIn` + `resolvePostAuthRoute`; close
the sheet; on error set the screen's error state). Reuse the screen's existing busy/error state and sheet
row styles (match the existing "Use password" row's style names).

- [ ] **Step 4: i18n**

In `apps/mobile/lib/i18n-mobile.ts`, in the `mobileAuth.en` block, add:
```ts
    continueWithGoogle: 'Continue with Google',
    orDivider: 'or',
    oauth_cancelled: 'Sign-in was cancelled.',
    oauth_failed: 'Could not sign in with Google. Please try again.',
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -w typecheck` (13/13). Then:
```bash
git add apps/mobile/lib/googleSignIn.ts "apps/mobile/app/(auth)/sign-in.tsx" "apps/mobile/app/(auth)/otp.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(auth): Continue with Google on sign-in + try-another-way (5I, AU-08)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: AU-09 — social pre-fill on create-account

**Files:**
- Modify: `apps/mobile/app/(auth)/create-account.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Detect a social session and pre-fill**

In `apps/mobile/app/(auth)/create-account.tsx`:
- Import the session hook: `import { useSession } from '@padel/auth';`
- Derive social state at the top of the component:
  ```tsx
  const { session } = useSession();
  const provider = session?.user?.app_metadata?.provider;
  const isSocial = provider != null && provider !== 'email' && provider !== 'phone';
  const socialEmail = session?.user?.email ?? '';
  const socialName =
    (session?.user?.user_metadata?.full_name as string | undefined) ??
    (session?.user?.user_metadata?.name as string | undefined) ??
    '';
  ```
- Initialize state from the social values: `const [fullName, setFullName] = useState(socialName);`
- For social sign-up the verified identifier is the **email** (from Google), so the missing identifier is
  the **phone**: override `secondaryKind` to `'phone'` when `isSocial`:
  ```tsx
  const secondaryKind = isSocial ? 'phone' : kind === 'phone' ? 'email' : 'phone';
  ```
- When `isSocial`, render a **disabled, pre-filled email field** above the name field, and make the
  **name field disabled** (still pre-filled). Example for the email field (only when `isSocial`):
  ```tsx
  {isSocial ? (
    <>
      <Text style={styles.label}>{t('secondaryEmailLabel')}</Text>
      <TextInput style={[styles.input, styles.inputDisabled]} value={socialEmail} editable={false} />
    </>
  ) : null}
  ```
  and on the name `TextInput` add `editable={!busy && !isSocial}` plus `style={[styles.input, isSocial && styles.inputDisabled]}`.
- Add `inputDisabled: { backgroundColor: '#F0F3F8', color: '#6B7685' }` to the styles.
- The phone + password fields and the terms gate are unchanged (still required). On submit, the existing
  `complete-account` call sends `{ phone, password, full_name }` — for social, `secondaryValue` is the phone
  and the email is already on `auth.users`, so no change to the fetch body is needed beyond `secondaryBody`
  resolving to `{ phone }` via `detectKind` (a phone number → `'phone'`).

- [ ] **Step 2: i18n (if any new copy)**

Reuse existing `fullNameLabel`, `secondaryEmailLabel`, `secondaryPhoneLabel`, `passwordLabel`. No new keys
required unless a distinct social title is desired (optional `socialCreateAccountTitle`); not required.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm -w typecheck` (13/13). Confirm `useSession` is exported from `@padel/auth` (it is — used across
the app). Then:
```bash
git add "apps/mobile/app/(auth)/create-account.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(auth): pre-fill email+name (disabled) for social sign-up (5I, AU-09)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **Typecheck:** `pnpm -w typecheck` — 13/13 (the only automated gate).
2. **Local supabase still starts:** `pnpm dlx supabase@latest --workdir infra db reset` succeeds
   (`[auth.external.google].enabled=false` means no credential requirement). No migration/SQL test exists
   for this slice.
3. **Manual (post-credentials, dev build) per `docs/superpowers/5i-social-signin-setup.md`:** Google button
   → browser → consent → returns to `mobile://auth/callback`; new user → Create-account (email+name disabled)
   → phone+password → Home; existing-email user → Home.

## Notes for the implementer

- **No new npm dependency** — Google web-OAuth uses the already-present `expo-web-browser` + `expo-linking`.
  Do not add `expo-auth-session` or `@react-native-google-signin/google-signin`.
- **Cannot be runtime-verified here** — typecheck is the gate; the live flow needs real Google credentials
  + a dev build (documented).
- Keep `[auth.external.google].enabled=false` in the committed config (so local `supabase start` works);
  enabling it is a credentials-time step in the setup doc.
- **Deferred (do NOT build):** Apple sign-in (`expo-apple-authentication` + `signInWithIdToken`, Apple
  Developer setup, App-Store rule); the §5.6 relay/duplicate-email conflict handling.
- The `_layout.tsx` no-profile→create-account fix also corrects OTP users interrupted before completing
  account creation — keep that behavior.
