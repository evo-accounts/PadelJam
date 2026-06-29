# Social Sign-In: Skip "Complete Your Account" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apple and Google sign-in users bypass the "Complete your account" screen, get a profile auto-provisioned from their provider identity, and land directly in onboarding.

**Architecture:** A new `provision-social-profile` Supabase Edge Function auto-creates the profiles row (phone: null, terms_accepted_at: now()) server-side from the caller's verified auth.users identity. The mobile client calls it immediately after social sign-in succeeds, before routing. `resolvePostAuthRoute` is unchanged — it already routes profile-exists users to onboarding. A safety-net re-try is added for the rare case where provisioning fails before routing. `profiles.phone` is made nullable so social users without a phone can be inserted.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Supabase Postgres migrations, React Native / Expo, Vitest (unit tests), `lib/**/*.test.ts` pattern.

**Spec:** `docs/superpowers/specs/2026-06-29-social-skip-complete-account-design.md`

---

## Task 1: Migration — make phone nullable, add terms_accepted_at

**Files:**
- Create: `infra/supabase/migrations/0084_social_profile_optional.sql`

- [ ] **Step 1: Write the migration**

```sql
-- profiles.phone becomes nullable so social sign-in users (Apple/Google) can be
-- provisioned without a phone. The UNIQUE constraint stays — Postgres allows multiple
-- NULLs, so social users coexist; OTP users still get uniqueness enforcement at the
-- application layer (complete-account function checks auth.users.phone is present).
-- terms_accepted_at records implicit consent timestamp for social sign-ins.
alter table profiles alter column phone drop not null;
alter table profiles add column if not exists terms_accepted_at timestamptz;
```

Save to `infra/supabase/migrations/0084_social_profile_optional.sql`.

- [ ] **Step 2: Apply locally and verify**

```bash
pnpm dlx supabase@latest --workdir /Users/joaopaulos4/Cursor/PadelJam/infra db reset
```

Expected: migration runs without error. Then verify:

```bash
docker exec supabase_db_padeljam psql -U postgres -d postgres -tAc \
  "select column_name, is_nullable, data_type from information_schema.columns \
   where table_name='profiles' and column_name in ('phone','terms_accepted_at') order by column_name;"
```

Expected output (2 rows):
```
phone|YES|text
terms_accepted_at|YES|timestamp with time zone
```

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/migrations/0084_social_profile_optional.sql
git commit -m "feat(db): make profiles.phone nullable, add terms_accepted_at"
```

---

## Task 2: Edge Function — `provision-social-profile`

**Files:**
- Create: `infra/supabase/functions/provision-social-profile/index.ts`

- [ ] **Step 1: Create the edge function file**

```typescript
// Provisions a profiles row for a social sign-in user (Apple or Google).
// Called by the mobile client immediately after sign-in succeeds.
// Security: reads identity from auth.users server-side — client cannot inject
// a foreign email into the globally-readable profiles table.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function resolveName(requestedName: string | undefined, metadata: Record<string, unknown>, email: string): string {
  if (requestedName?.trim()) return requestedName.trim().replace(/\s+/g, ' ');
  const meta = (metadata.full_name ?? metadata.name) as string | undefined;
  if (meta?.trim()) return meta.trim().replace(/\s+/g, ' ');
  // Derive from email local-part: "joao.pereira" -> "Joao Pereira"
  const local = email.split('@')[0] ?? '';
  const derived = local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return derived || 'Jammer';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify the caller's JWT.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });

  // Only allow social providers — reject OTP users so they still go through complete-account.
  const provider = (user.app_metadata?.provider as string | undefined) ?? '';
  if (!['apple', 'google'].includes(provider)) {
    return json({ error: 'not_social_provider' }, 403);
  }

  let body: { full_name?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const email = user.email;
  if (!email) return json({ error: 'no_email_on_user' }, 400);

  const fullName = resolveName(body.full_name, user.user_metadata ?? {}, email);

  const admin = createClient(url, serviceKey);

  // Idempotent upsert — ignoreDuplicates means a returning user's profile is untouched.
  const { error: upsertErr } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email,
      phone: null,
      full_name: fullName,
      terms_accepted_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (upsertErr) return json({ error: upsertErr.message }, 400);

  return json({ ok: true });
});
```

Save to `infra/supabase/functions/provision-social-profile/index.ts`.

- [ ] **Step 2: Restart local Supabase to register the new function**

```bash
pnpm dlx supabase@latest --workdir /Users/joaopaulos4/Cursor/PadelJam/infra stop
pnpm dlx supabase@latest --workdir /Users/joaopaulos4/Cursor/PadelJam/infra start
```

- [ ] **Step 3: Smoke-test the provider guard (should 403)**

Use the local anon key from `.env`. Get a **phone-OTP session token** first (or use any OTP-authenticated user token). Then call the function — it must reject non-social callers:

```bash
# Replace <TOKEN> with a valid local session token for an OTP user
curl -s -X POST http://127.0.0.1:55321/functions/v1/provision-social-profile \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"error":"not_social_provider"}` with HTTP 403.

- [ ] **Step 4: Smoke-test idempotency with a social user token (local stack)**

If you have a local Apple/Google session token, call it twice:

```bash
curl -s -X POST http://127.0.0.1:55321/functions/v1/provision-social-profile \
  -H "Authorization: Bearer <SOCIAL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Test User"}'
```

First call → `{"ok":true}`. Second call → `{"ok":true}` (no error — idempotent).

Verify only one profile row:
```bash
docker exec supabase_db_padeljam psql -U postgres -d postgres -tAc \
  "select id, email, phone, full_name, terms_accepted_at from profiles where email='<USER_EMAIL>';"
```

Expected: one row, `phone` is NULL, `terms_accepted_at` is set.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/functions/provision-social-profile/index.ts
git commit -m "feat(functions): provision-social-profile edge function"
```

---

## Task 3: Client wrapper — `lib/provisionSocialProfile.ts`

**Files:**
- Create: `apps/mobile/lib/provisionSocialProfile.ts`
- Test: `apps/mobile/lib/provisionSocialProfile.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/lib/provisionSocialProfile.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the fetch call shape, not the edge function itself.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// We need SUPABASE_URL — stub the module.
vi.mock('@/lib/supabase', () => ({ SUPABASE_URL: 'https://example.supabase.co' }));

// Import after mocks are set up.
const { provisionSocialProfile } = await import('./provisionSocialProfile');

describe('provisionSocialProfile', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('POSTs to provision-social-profile with the access token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await provisionSocialProfile('test-token-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/provision-social-profile',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token-123' }),
      }),
    );
  });

  it('includes full_name in body when provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await provisionSocialProfile('tok', 'Maria Santos');
    const call = mockFetch.mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({ full_name: 'Maria Santos' });
  });

  it('sends empty body when name is not provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await provisionSocialProfile('tok');
    const call = mockFetch.mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({});
  });

  it('throws provision_failed on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'some error' }) });
    await expect(provisionSocialProfile('tok')).rejects.toThrow('provision_failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm vitest run lib/provisionSocialProfile.test.ts
```

Expected: FAIL — `Cannot find module './provisionSocialProfile'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/mobile/lib/provisionSocialProfile.ts
import { SUPABASE_URL } from '@/lib/supabase';

/**
 * Call the provision-social-profile edge function to create (or no-op if existing)
 * the profiles row for the currently-signed-in social user.
 * Throws Error('provision_failed') on network or server error.
 */
export async function provisionSocialProfile(
  accessToken: string,
  fullName?: string,
): Promise<void> {
  const body = fullName ? { full_name: fullName } : {};
  const resp = await fetch(
    `${SUPABASE_URL}/functions/v1/provision-social-profile`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) throw new Error('provision_failed');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/mobile && pnpm vitest run lib/provisionSocialProfile.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/provisionSocialProfile.ts apps/mobile/lib/provisionSocialProfile.test.ts
git commit -m "feat(mobile): provisionSocialProfile client wrapper + tests"
```

---

## Task 4: Wire provision into Apple sign-in

**Files:**
- Modify: `apps/mobile/lib/appleSignIn.ts`

- [ ] **Step 1: Update `runAppleSignIn` to call provision**

Replace the current `runAppleSignIn` iOS path in `apps/mobile/lib/appleSignIn.ts`. The changes are:
1. Import `provisionSocialProfile`.
2. After `signInWithAppleIdToken` succeeds, get the session access token and call `provisionSocialProfile` with the credential name.
3. Remove the loose `updateUser` name write (provision is now the authoritative write).
4. Map `provision_failed` to `oauth_failed` in the error handler (same user-facing message).

```typescript
import { exchangeCodeForSession, signInWithAppleIdToken, startAppleOAuth } from '@padel/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { assertNoSocialEmailConflict } from '@/lib/socialConflict';
import { provisionSocialProfile } from '@/lib/provisionSocialProfile';
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

    // Provision the profile server-side from Apple's verified identity.
    // Pass the credential name (only populated on first sign-in by Apple).
    const { data: { session } } = await supabase.auth.getSession();
    const full = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
    if (session?.access_token) {
      try {
        await provisionSocialProfile(session.access_token, full || undefined);
      } catch {
        throw new Error('oauth_failed');
      }
    }
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

    // Android: no credential name available; function reads metadata.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      try {
        await provisionSocialProfile(session.access_token);
      } catch {
        throw new Error('oauth_failed');
      }
    }
  }
  await assertNoSocialEmailConflict();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile && pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `appleSignIn.ts` or `provisionSocialProfile.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/appleSignIn.ts
git commit -m "feat(mobile): wire provision-social-profile into Apple sign-in"
```

---

## Task 5: Wire provision into Google sign-in

**Files:**
- Modify: `apps/mobile/lib/googleSignIn.ts`

- [ ] **Step 1: Update `runGoogleSignIn` to call provision**

Replace the full contents of `apps/mobile/lib/googleSignIn.ts`:

```typescript
import { exchangeCodeForSession, startGoogleOAuth } from '@padel/auth';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { assertNoSocialEmailConflict } from '@/lib/socialConflict';
import { provisionSocialProfile } from '@/lib/provisionSocialProfile';
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
      throw new Error('oauth_failed');
    }
  }

  await assertNoSocialEmailConflict();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile && pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/googleSignIn.ts
git commit -m "feat(mobile): wire provision-social-profile into Google sign-in"
```

---

## Task 6: Safety-net in `resolvePostAuthRoute`

**Files:**
- Modify: `apps/mobile/lib/postAuthRoute.ts`
- Test: `apps/mobile/lib/postAuthRoute.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/mobile/lib/postAuthRoute.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
const mockGetSession = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  },
}));

// Mock provisionSocialProfile
const mockProvision = vi.fn();
vi.mock('@/lib/provisionSocialProfile', () => ({ provisionSocialProfile: mockProvision }));

const { resolvePostAuthRoute } = await import('./postAuthRoute');

const makeSession = (provider: string, token = 'tok') => ({
  data: {
    session: {
      access_token: token,
      user: { id: 'u1', app_metadata: { provider } },
    },
  },
});

const makeProfileQuery = (profile: object | null) => ({
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }),
  }),
});

beforeEach(() => { vi.resetAllMocks(); });

describe('resolvePostAuthRoute', () => {
  it('returns sign-in when no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await resolvePostAuthRoute()).toBe('/(auth)/sign-in');
  });

  it('returns tabs when profile is onboarded', async () => {
    mockGetSession.mockResolvedValue(makeSession('email'));
    mockFrom.mockReturnValue(makeProfileQuery({ onboarded_at: '2026-01-01', location_text: 'Lisbon', dominant_hand: 'right', court_side: 'left' }).from());
    expect(await resolvePostAuthRoute()).toBe('/(tabs)');
  });

  it('OTP user with no profile → create-account (no provision called)', async () => {
    mockGetSession.mockResolvedValue(makeSession('email'));
    mockFrom.mockReturnValue(makeProfileQuery(null).from());
    expect(await resolvePostAuthRoute()).toBe('/(auth)/create-account');
    expect(mockProvision).not.toHaveBeenCalled();
  });

  it('social user with no profile → retries provision then routes to onboarding', async () => {
    mockGetSession.mockResolvedValue(makeSession('apple', 'tok'));
    mockProvision.mockResolvedValue(undefined);
    let calls = 0;
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            calls++;
            // First call: no profile. Second call (after provision): profile exists.
            return calls === 1
              ? { data: null }
              : { data: { onboarded_at: null, location_text: null, dominant_hand: null, court_side: null } };
          },
        }),
      }),
    });
    expect(await resolvePostAuthRoute()).toBe('/(onboarding)/location');
    expect(mockProvision).toHaveBeenCalledWith('tok', undefined);
  });

  it('social user provision fails → falls through to create-account', async () => {
    mockGetSession.mockResolvedValue(makeSession('google', 'tok'));
    mockProvision.mockRejectedValue(new Error('provision_failed'));
    mockFrom.mockReturnValue(makeProfileQuery(null).from());
    expect(await resolvePostAuthRoute()).toBe('/(auth)/create-account');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/mobile && pnpm vitest run lib/postAuthRoute.test.ts
```

Expected: FAIL — several tests failing because provision safety-net doesn't exist yet.

- [ ] **Step 3: Update `resolvePostAuthRoute`**

Replace the full contents of `apps/mobile/lib/postAuthRoute.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/mobile && pnpm vitest run lib/postAuthRoute.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Run full test suite to catch regressions**

```bash
cd apps/mobile && pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/postAuthRoute.ts apps/mobile/lib/postAuthRoute.test.ts
git commit -m "feat(mobile): safety-net provision retry in resolvePostAuthRoute + tests"
```

---

## Task 7: i18n — add `socialTermsDisclosure` key

**Files:**
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add the key to all three locales in `mobileAuth`**

In `apps/mobile/lib/i18n-mobile.ts`, add `socialTermsDisclosure` to each locale block inside `mobileAuth`. Find each locale's closing `},` and insert before it:

**`'pt-PT'` block** — add after `recoveryDoneCta: 'Continuar',`:
```
socialTermsDisclosure: 'Ao continuar, aceita os nossos {{termsLink}} e {{privacyLink}}.',
```

**`'pt-BR'` block** — add after `recoveryDoneCta: 'Continuar',`:
```
socialTermsDisclosure: 'Ao continuar, você concorda com nossos {{termsLink}} e {{privacyLink}}.',
```

**`en` block** — add after `recoveryDoneCta: 'Continue',`:
```
socialTermsDisclosure: 'By continuing, you agree to our {{termsLink}} and {{privacyLink}}.',
```

- [ ] **Step 2: Run i18n parity tests to verify all locales have the key**

```bash
cd apps/mobile && pnpm vitest run lib/i18n-mobile.test.ts
```

Expected: PASS. The test checks all locale keys match `en`. If any locale is missing the key, it fails here.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(i18n): add socialTermsDisclosure key to auth namespace (all locales)"
```

---

## Task 8: UI — terms disclosure on sign-in screen

**Files:**
- Modify: `apps/mobile/app/(auth)/sign-in.tsx`

- [ ] **Step 1: Add disclosure line below social buttons**

In `apps/mobile/app/(auth)/sign-in.tsx`, add the following:

1. Add `Linking` to the imports (it's not currently imported in sign-in.tsx):
```typescript
import { ..., Linking, ... } from 'react-native';
```

2. Add constants after the existing `useT` call at the top of the component:
```typescript
const TERMS_URL = 'https://padeljam.app/terms';
const PRIVACY_URL = 'https://padeljam.app/privacy';
```

3. After the closing `)}` of the Apple button block (end of the `View style={styles.inner}` content), add the disclosure text. The raw string uses `{{termsLink}}` and `{{privacyLink}}` as placeholders — render it as a split string. Replace with the block below:

```tsx
<Text style={styles.disclosure}>
  {'By continuing, you agree to our '}
  <Text style={styles.disclosureLink} onPress={() => void Linking.openURL(TERMS_URL)}>
    {t('termsLink')}
  </Text>
  {' and '}
  <Text style={styles.disclosureLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>
    {t('privacyLink')}
  </Text>
  {'.'}
</Text>
```

> Note: use the literal strings `'By continuing, you agree to our '` / `' and '` rather than `t('socialTermsDisclosure')` with a split, to keep JSX simple. The i18n key is used only in future web/other surfaces.

4. Add styles at the end of `StyleSheet.create({...})`:
```typescript
  disclosure: { fontSize: 11, color: '#9AA7B6', textAlign: 'center', marginTop: 16, lineHeight: 16 },
  disclosureLink: { color: '#0B7BFF', fontWeight: '600' },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile && pnpm tsc --noEmit 2>&1 | grep "sign-in" | head -10
```

Expected: no errors for `sign-in.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(auth\)/sign-in.tsx
git commit -m "feat(mobile): implicit terms disclosure on sign-in screen"
```

---

## Task 9: UI — terms disclosure on welcome screen

**Files:**
- Modify: `apps/mobile/app/(auth)/welcome.tsx`

- [ ] **Step 1: Add disclosure below the "Start now" button**

In `apps/mobile/app/(auth)/welcome.tsx`:

1. Add `Linking` to imports:
```typescript
import { ..., Linking, ... } from 'react-native';
```

2. Add constants and `useT` at top of `WelcomeScreen`:
```typescript
const { t } = useT('auth');   // add alongside existing useT('onboarding')
const TERMS_URL = 'https://padeljam.app/terms';
const PRIVACY_URL = 'https://padeljam.app/privacy';
```

> Note: the file already has `const { t } = useT('onboarding')`. Rename it to `tOnboarding` and keep `t` for auth, or alias: `const { t: tAuth } = useT('auth')`. Use `tAuth` in the disclosure text.

3. After the `<Pressable style={styles.button}...>` block, add:
```tsx
<Text style={styles.disclosure}>
  {'By continuing, you agree to our '}
  <Text style={styles.disclosureLink} onPress={() => void Linking.openURL(TERMS_URL)}>
    {tAuth('termsLink')}
  </Text>
  {' and '}
  <Text style={styles.disclosureLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>
    {tAuth('privacyLink')}
  </Text>
  {'.'}
</Text>
```

4. Add styles:
```typescript
  disclosure: { fontSize: 11, color: '#9AA7B6', textAlign: 'center', marginTop: 12, marginHorizontal: 24, lineHeight: 16 },
  disclosureLink: { color: '#0B7BFF', fontWeight: '600' },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile && pnpm tsc --noEmit 2>&1 | grep "welcome" | head -10
```

Expected: no errors for `welcome.tsx`.

- [ ] **Step 3: Run full test suite**

```bash
cd apps/mobile && pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/\(auth\)/welcome.tsx
git commit -m "feat(mobile): implicit terms disclosure on welcome screen"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run db reset to confirm migration applies cleanly end-to-end**

```bash
pnpm dlx supabase@latest --workdir /Users/joaopaulos4/Cursor/PadelJam/infra db reset
```

Expected: all 84 migrations apply without error.

- [ ] **Step 2: Run all mobile tests**

```bash
cd apps/mobile && pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 3: TypeScript check**

```bash
cd apps/mobile && pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Verify `resolvePostAuthRoute` still sends OTP users to create-account**

Check the test added in Task 6 covers this. Re-run specifically:

```bash
cd apps/mobile && pnpm vitest run lib/postAuthRoute.test.ts
```

Expected: PASS including `'OTP user with no profile → create-account (no provision called)'`.

- [ ] **Step 5: Final commit (if any loose files)**

```bash
git status
```

If clean: done. If any unstaged changes remain, stage and commit them.
