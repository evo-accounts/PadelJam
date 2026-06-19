# Apple Sign-In + Duplicate-Email Conflict (B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sign in with Apple (native iOS + Supabase web-OAuth on Android) and §5.6 duplicate-email conflict handling for both social providers.

**Architecture:** A param-less SECURITY DEFINER RPC detects the email conflict (SQL-testable); `@padel/auth` gains Apple wrappers mirroring Google; a mobile `appleSignIn` flow (native on iOS, web on Android) + a shared conflict guard wire into the sign-in/OTP screens.

**Tech Stack:** Supabase (RPC), `@padel/auth`, Expo (`expo-apple-authentication`, `expo-crypto`, `expo-web-browser`), React Native.

**Spec:** [docs/superpowers/specs/2026-06-19-apple-signin-design.md](specs/2026-06-19-apple-signin-design.md)

**Note:** the native Apple flow + live OAuth verify on your iOS dev build (gated). Locally verifiable: the conflict RPC (SQL test), typecheck, the i18n parity test. Build order matters — RPC/types → auth wrappers → deps → flow → screens.

---

## Task 1: Migration `0083` — conflict RPC + types

**Files:** Create `infra/supabase/migrations/0083_social_email_conflict.sql`; Modify `packages/db/src/database.types.ts`.

- [ ] **Step 1: Write the migration**

```sql
-- B1/§5.6: detect a social sign-in whose email is already owned by a DIFFERENT account.
-- Param-less (uses the caller's own session email) so it can't enumerate other users' emails.
create or replace function social_email_conflict() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles p
    join auth.users u on u.id = p.id
    where u.id <> auth.uid()
      and (select email from auth.users where id = auth.uid()) is not null
      and lower(u.email) = lower((select email from auth.users where id = auth.uid()))
  );
$$;
grant execute on function social_email_conflict() to authenticated;
```

- [ ] **Step 2: Apply** — `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset` → clean through `0083`.

- [ ] **Step 3: Add the type** — in `packages/db/src/database.types.ts` `Functions`:
```ts
social_email_conflict: { Args: Record<string, never>; Returns: boolean }
```

- [ ] **Step 4: Typecheck + commit**
`pnpm -w typecheck` → 13/13.
```bash
git add infra/supabase/migrations/0083_social_email_conflict.sql packages/db/src/database.types.ts
git commit -m "feat(auth): social_email_conflict RPC + type (B1/§5.6)"
```

---

## Task 2: SQL test

**Files:** Create `infra/supabase/tests/social_email_conflict.sql`.

- [ ] **Step 1: Write the test** (mirror `infra/supabase/tests/*` style; seed two users, one sharing an email).

```sql
-- B1/§5.6: social_email_conflict() — true iff a DIFFERENT user owns a profiles row with the caller's email.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('c1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dup@x.com'),
  ('c1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dup@x.com'),
  ('c1000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','solo@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('c1000001-0000-0000-0000-000000000001','dup@x.com','+351911000001','DupA'),
  ('c1000002-0000-0000-0000-000000000002','dup@x.com','+351911000002','DupB'),
  ('c1000003-0000-0000-0000-000000000003','solo@x.com','+351911000003','Solo') on conflict do nothing;

do $$
declare r boolean;
begin
  -- As user B (email dup@x.com), user A also owns a profiles row with dup@x.com -> conflict true.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"c1000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  select social_email_conflict() into r;
  if not r then raise exception using errcode='PT001', message='expected conflict=true for a shared email'; end if;
  raise notice 'OK conflict true when another user shares the email';

  -- As the solo user, nobody else shares the email -> false.
  perform set_config('request.jwt.claims','{"sub":"c1000003-0000-0000-0000-000000000003","role":"authenticated"}',true);
  select social_email_conflict() into r;
  if r then raise exception using errcode='PT001', message='expected conflict=false for a unique email'; end if;
  raise notice 'OK conflict false for a unique email';

  raise notice 'OK social_email_conflict';
end $$;
rollback;
```

- [ ] **Step 2: Run** — `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/social_email_conflict.sql` → `OK social_email_conflict`, no `PT001`. If a `profiles` NOT-NULL column is missing in the seed, add it (check `0003_profiles.sql`); if a `PT001` fires, the RPC logic is wrong — STOP and report.

- [ ] **Step 3: Commit**
```bash
git add infra/supabase/tests/social_email_conflict.sql
git commit -m "test(auth): social_email_conflict SQL test (B1)"
```

---

## Task 3: `@padel/auth` Apple wrappers

**Files:** Modify `packages/auth/src/oauth.ts`.

- [ ] **Step 1: Add the wrappers** (append, mirroring `startGoogleOAuth`):
```ts
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
```

- [ ] **Step 2: Verify + commit**
`pnpm -w typecheck && pnpm --filter @padel/auth test` → pass.
```bash
git add packages/auth/src/oauth.ts
git commit -m "feat(auth): startAppleOAuth + signInWithAppleIdToken wrappers (B1)"
```

---

## Task 4: Deps + app config

**Files:** `apps/mobile/package.json` + lockfile (via `expo install`); `apps/mobile/app.json`.

- [ ] **Step 1: Install the native deps** — from `apps/mobile/`:
`npx expo install expo-apple-authentication expo-crypto`
(SDK-56-aligned; both get added to `package.json` + the lockfile.)

- [ ] **Step 2: app.json** — add the plugin + iOS entitlement. In `apps/mobile/app.json`, add `"expo-apple-authentication"` to the `plugins` array, and add `"usesAppleSignIn": true` to the `ios` block:
```json
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "app.padeljam",
      "usesAppleSignIn": true
    },
```

- [ ] **Step 3: Typecheck + commit**
`pnpm -w typecheck` → 13/13.
```bash
git add apps/mobile/package.json apps/mobile/app.json pnpm-lock.yaml
git commit -m "chore(mobile): expo-apple-authentication + expo-crypto + Apple entitlement (B1)"
```

---

## Task 5: Mobile Apple flow + shared conflict guard

**Files:** Create `apps/mobile/lib/socialConflict.ts`; Create `apps/mobile/lib/appleSignIn.ts`; Modify `apps/mobile/lib/googleSignIn.ts`.

- [ ] **Step 1: Conflict guard** — `apps/mobile/lib/socialConflict.ts`:
```ts
import { supabase } from '@/lib/supabase';

/** After a social session is established, bounce if the email is already owned by a different account (§5.6).
 *  Best-effort: a transient RPC error does not block sign-in. Throws Error('email_conflict') on a real conflict. */
export async function assertNoSocialEmailConflict(): Promise<void> {
  const { data: conflict, error } = await supabase.rpc('social_email_conflict');
  if (error) return;
  if (conflict) {
    await supabase.auth.signOut();
    throw new Error('email_conflict');
  }
}
```

- [ ] **Step 2: Apple flow** — `apps/mobile/lib/appleSignIn.ts`:
```ts
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
```

- [ ] **Step 3: Wire the guard into Google too** — in `apps/mobile/lib/googleSignIn.ts`, after the successful `exchangeCodeForSession` (the final lines), add the import `import { assertNoSocialEmailConflict } from '@/lib/socialConflict';` and, replacing the end of `runGoogleSignIn`:
```ts
  const { error: exchangeError } = await exchangeCodeForSession(supabase, code);
  if (exchangeError) throw new Error('oauth_failed');
  await assertNoSocialEmailConflict();
```

- [ ] **Step 4: Typecheck + commit**
`pnpm -w typecheck` → 13/13. (If `AppleAuthentication.AppleAuthenticationCredential` type name differs, use the exported credential type or `Awaited<ReturnType<typeof AppleAuthentication.signInAsync>>`.)
```bash
git add apps/mobile/lib/socialConflict.ts apps/mobile/lib/appleSignIn.ts apps/mobile/lib/googleSignIn.ts
git commit -m "feat(mobile): Apple sign-in flow + shared social-email conflict guard (B1)"
```

---

## Task 6: Auth screens + i18n

**Files:** Modify `apps/mobile/app/(auth)/sign-in.tsx`, `apps/mobile/app/(auth)/otp.tsx`, `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: i18n keys (all three locales — parity-test-required).** In `apps/mobile/lib/i18n-mobile.ts`, after each `continueWithGoogle` line in `mobileAuth` (pt-PT ~L45, pt-BR ~L99, en ~L153), add:
  - en: `continueWithApple: 'Continue with Apple',` + `email_conflict: 'This email is already linked to a different sign-in. Use that one instead.',`
  - pt-PT: `continueWithApple: 'Continuar com a Apple',` + `email_conflict: 'Este email já está associado a outro início de sessão. Usa esse.',`
  - pt-BR: `continueWithApple: 'Continuar com a Apple',` + `email_conflict: 'Este e-mail já está vinculado a outro login. Use esse.',`

- [ ] **Step 2: sign-in.tsx — Apple button + handler.** Add imports:
```tsx
import * as AppleAuthentication from 'expo-apple-authentication';
import { runAppleSignIn } from '@/lib/appleSignIn';
```
Add availability state in the component (near other hooks):
```tsx
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);
```
Add `onApple` mirroring `onGoogle`:
```tsx
  const onApple = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await runAppleSignIn();
      router.replace((await resolvePostAuthRoute()) as never);
    } catch (e) {
      if (e instanceof Error && e.message === 'oauth_cancelled') { setBusy(false); return; }
      setError(t(e instanceof Error ? e.message : 'oauth_failed'));
    } finally {
      setBusy(false);
    }
  };
```
Render the Apple affordance right after the Google `Pressable`:
```tsx
        {Platform.OS === 'ios' && appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={onApple}
          />
        ) : (
          <Pressable
            style={[styles.googleButton, busy && styles.buttonDisabled]}
            onPress={onApple}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.googleButtonText}>{t('continueWithApple')}</Text>
          </Pressable>
        )}
```
Add a style `appleButton: { height: 48, marginTop: 12 },` to the StyleSheet. (`useState`/`useEffect`/`Platform` are already imported in this screen — verify and add any missing import.)

- [ ] **Step 3: otp.tsx — Apple in the "Try another way" sheet.** Add `import { runAppleSignIn } from '@/lib/appleSignIn';` + an `onApple` handler mirroring this screen's `onGoogle` (it does `setSheetOpen(false)` first; on `oauth_cancelled` just `setBusy(false); return;`). No `appleAvailable` gate needed here — the sheet uses a plain text row that works on both platforms via `runAppleSignIn`'s platform split. After the Google row, add:
```tsx
            <Pressable style={styles.sheetRow} onPress={onApple} accessibilityRole="button">
              <Text style={styles.sheetText}>{t('continueWithApple')}</Text>
            </Pressable>
```
(The OTP sheet uses simple text rows, so use the text row for Apple too — the native Apple button isn't required inside this menu.)

- [ ] **Step 4: Verify + commit**
`pnpm -w typecheck` → 13/13; `pnpm --filter mobile test` → i18n parity green (new `auth` keys present in all three locales).
```bash
git add apps/mobile/app/(auth)/sign-in.tsx apps/mobile/app/(auth)/otp.tsx apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): Continue with Apple on sign-in + OTP; email_conflict copy (B1)"
```

---

## Verification (end-to-end)

1. **DB:** `db reset` clean through `0083`; `social_email_conflict.sql` → `OK`.
2. **Types/API/i18n:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`; `pnpm --filter mobile test` (parity green).
3. **On your iOS dev build (gated):** enable `[auth.external.apple]` in Supabase with the Apple Developer Services ID + key; native Apple sheet → session → routing (new → create-account prefilled w/ Apple name; returning → Home; conflict → inline §5.6 + bounce). Android web-Apple; Google conflict case.

## Out of scope

Production redirect allow-listing; account merge/linking UX (spec = bounce); B4 push; B3 image-card.
