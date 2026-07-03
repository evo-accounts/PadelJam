# Onboarding Session-Loss Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop new users from being signed out mid-onboarding by re-establishing a fresh session (with the password they just set) immediately after `complete-account`.

**Architecture:** After `complete-account` succeeds, the client calls the existing `signInWithPassword` wrapper with the **primary verified identifier** + the new password, minting a durable session before navigating to onboarding. A tiny pure helper picks the primary credential (email for email/social sign-ups, phone for phone sign-ups) and is unit-tested.

**Tech Stack:** React Native / Expo Router, `@padel/auth` (supabase-js wrapper), vitest.

**Spec:** [docs/superpowers/specs/2026-06-20-onboarding-session-loss-design.md](specs/2026-06-20-onboarding-session-loss-design.md)

---

## Task 1: `primaryCredential` pure helper (+ test)

**Files:**
- Modify: `packages/auth/src/password.ts`
- Test: `packages/auth/src/password.test.ts`
- Modify (if needed): `packages/auth/src/index.ts` (ensure `primaryCredential` + `signInWithPassword` are exported)

- [ ] **Step 1: Write the failing test** — append to `packages/auth/src/password.test.ts`:

```ts
import { primaryCredential } from './password';

describe('primaryCredential', () => {
  it('uses email when the primary kind is email', () => {
    expect(primaryCredential({ primaryKind: 'email', email: 'a@b.com', phone: '+351900000000' }))
      .toEqual({ identifier: 'a@b.com', kind: 'email' });
  });
  it('uses phone when the primary kind is phone', () => {
    expect(primaryCredential({ primaryKind: 'phone', email: 'a@b.com', phone: '+351900000000' }))
      .toEqual({ identifier: '+351900000000', kind: 'phone' });
  });
  it('returns null when the chosen identifier is missing', () => {
    expect(primaryCredential({ primaryKind: 'email', email: null, phone: '+351900000000' })).toBeNull();
    expect(primaryCredential({ primaryKind: 'phone', email: 'a@b.com', phone: undefined })).toBeNull();
  });
});
```

(If `password.test.ts` lacks the vitest imports, add `import { describe, it, expect } from 'vitest';` at the top — match the style already used in that file.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @padel/auth test`
Expected: FAIL — `primaryCredential is not a function` / not exported.

- [ ] **Step 3: Implement the helper** — append to `packages/auth/src/password.ts`:

```ts
/**
 * Pick the credential to re-authenticate with after account completion: the PRIMARY (already-verified)
 * identifier. Email-started and social sign-ups verify the email; phone-started verifies the phone.
 * Returns null when the chosen identifier isn't present on the user.
 */
export function primaryCredential(args: {
  primaryKind: 'email' | 'phone';
  email: string | null | undefined;
  phone: string | null | undefined;
}): { identifier: string; kind: 'email' | 'phone' } | null {
  if (args.primaryKind === 'email') return args.email ? { identifier: args.email, kind: 'email' } : null;
  return args.phone ? { identifier: args.phone, kind: 'phone' } : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @padel/auth test`
Expected: PASS (new cases green, existing tests still green).

- [ ] **Step 5: Ensure exports**

Confirm `packages/auth/src/index.ts` re-exports `password.ts` (e.g. `export * from './password';`). If `signInWithPassword`/`primaryCredential` are not reachable from `@padel/auth`, add the export. Verify with:
Run: `pnpm --filter @padel/auth typecheck` (or `pnpm -w typecheck`)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/auth/src/password.ts packages/auth/src/password.test.ts packages/auth/src/index.ts
git commit -m "feat(auth): primaryCredential helper for post-signup re-auth (Phase 1.1)"
```

---

## Task 2: Re-establish the session in `create-account`

**Files:**
- Modify: `apps/mobile/app/(auth)/create-account.tsx` (imports + `submit()`, around lines 20–21 and 86–92)

- [ ] **Step 1: Add imports.** Update the `@padel/auth` import to also bring in the helpers, and keep the existing `supabase` import:

```ts
import { primaryCredential, signInWithPassword, useSession } from '@padel/auth';
```

(Remove the now-duplicated `useSession` import line if it was separate.)

- [ ] **Step 2: Re-auth after `complete-account`.** In `submit()`, replace the success tail (currently):

```ts
      if (!resp.ok) {
        setError(`complete-account-failed:${resp.status}`);
        return;
      }

      router.replace('/(onboarding)/location');
```

with:

```ts
      if (!resp.ok) {
        setError(`complete-account-failed:${resp.status}`);
        return;
      }

      // complete-account sets a password via the admin API, which rotates the OTP-issued refresh
      // token — the current session would be signed out at the next refresh, mid-onboarding. Mint a
      // fresh, durable session with the password we just set, using the primary verified identifier.
      const cred = primaryCredential({
        primaryKind: isSocial ? 'email' : kind,
        email: session.user.email,
        phone: session.user.phone,
      });
      if (cred) {
        const { error: signInErr } = await signInWithPassword(supabase, cred.identifier, cred.kind, password);
        if (signInErr) {
          setError('session-refresh-failed');
          router.replace('/(auth)/sign-in');
          return;
        }
      }

      router.replace('/(onboarding)/location');
```

Notes for the implementer:
- `session` here is the local const fetched via `supabase.auth.getSession()` earlier in `submit()` (not the hook value) — `session.user.email` / `session.user.phone` reflect the current user.
- `kind` comes from `getAuthTarget()` (already in scope); `isSocial` is already computed at the top of the component.
- `setError('session-refresh-failed')` follows this screen's existing raw-string error convention (errors are rendered untranslated at line ~162); do **not** add an i18n key (avoids the i18n parity-test surface).

- [ ] **Step 3: Typecheck**

Run: `pnpm -w typecheck`
Expected: PASS (13/13).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(auth)/create-account.tsx
git commit -m "fix(auth): re-establish session after complete-account to survive onboarding (Phase 1.1)"
```

---

## Task 3: End-to-end verification (iOS simulator + local Supabase)

No code; confirm the bug is fixed the way it was found. Local Supabase stack must be running; build/run the app on the iPhone simulator (`cd apps/mobile && npx expo run:ios` or reuse the running dev client).

- [ ] **Step 1: (Optional) reproduce pre-fix** — on the prior build, a fresh email-OTP signup → complete account → onboarding bounced to sign-in with `active_sessions = 0`. (Already observed; skip if rebuilding straight to the fix.)

- [ ] **Step 2: Verify post-fix (email-started).** Fresh email (e.g. `runner2@padeljam.test`) → OTP from Mailpit (`http://localhost:55324/api/v1/messages`) → complete account (name + phone + password + terms) → walk all onboarding steps (location/hand/side, Finish on Jammer+). Expected: lands on **Home**, no bounce.

Verify the session + onboarding persisted:
```bash
docker exec supabase_db_padeljam psql -U postgres -d postgres -tAc "
select u.email,
  (p.onboarded_at is not null) as onboarded,
  (select count(*) from auth.sessions s where s.user_id=u.id) as active_sessions
from auth.users u left join public.profiles p on p.id=u.id
where u.email='runner2@padeljam.test';"
```
Expected: `onboarded = t`, `active_sessions >= 1`.

- [ ] **Step 3: Verify post-fix (phone-started).** Sign up with a test phone (`+351912345678`, OTP `123456` per `[auth.sms.test_otp]`) → secondary = email → complete account → onboarding → Home. (Note: that number maps to an existing test user; use the other test number `+5511987654321` / `123456` if a clean phone-started user is needed.) Expected: same successful result (re-auth via `signInWithPassword({ phone, password })`).

- [ ] **Step 4: Regression.** Sign out, then sign back in via OTP as the new user → lands on Home (already onboarded). Confirm normal login is unaffected.

---

## Verification (summary)
- `pnpm --filter @padel/auth test` (Task 1), `pnpm -w typecheck` (Task 2), end-to-end sim run (Task 3).
- Then finish the branch via superpowers:finishing-a-development-branch (merge to `main` after review).

## Out of scope
Returning-user OTP-code email (Phase 1.2), chat-gate robustness (Phase 1.3), and translating this screen's error strings.
