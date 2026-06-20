# Onboarding Session-Loss Fix — Design

**Slice:** Phase 1.1 (launch blocker) from the requirements-audit roadmap.

## Problem

A brand-new user who signs up via OTP is **signed out partway through onboarding**, before
`profiles.onboarded_at` is set — a production sign-up dead-end. Observed live on the iOS simulator: after
completing the account and walking the onboarding steps, the app bounced back to the sign-in screen and the
user had **0 active sessions**, with `onboarded_at` still null.

## Root cause

The post-OTP account-completion flow never re-establishes the session after a server-side credential mutation:

1. The user verifies their primary identifier via OTP → an OTP-issued session (access + refresh token) is
   stored on-device.
2. `infra/supabase/functions/complete-account/index.ts:47` calls admin `updateUserById(user.id, { phone/email,
   password })` — attaching the secondary identifier **and setting a password**. Setting the password rotates /
   invalidates the OTP-issued refresh token server-side.
3. The client (`apps/mobile/app/(auth)/create-account.tsx:92`) immediately `router.replace`s to
   `/(onboarding)/location` while still holding the **stale** session. The access token works for a few minutes
   (so early onboarding writes succeed), but the next token refresh fails → `SIGNED_OUT` → bounce to sign-in.

## Approach (chosen)

**Client re-establishes a fresh session with the password the user just set**, before navigating to onboarding.

In `create-account.tsx` `submit()`, after `complete-account` returns ok and **before**
`router.replace('/(onboarding)/location')`:

- Determine the **primary (already-verified) identifier** from the current session:
  - `session.user.email` when `kind === 'email'` or social sign-up,
  - `session.user.phone` when `kind === 'phone'`.
- Call `supabase.auth.signInWithPassword({ <email|phone>, password })` to mint a fresh, durable session that is
  not subject to the prior token rotation.
- Then navigate to `/(onboarding)/location`.

This is robust to the exact GoTrue token-rotation behavior because it obtains a brand-new clean session **after**
all account mutations are complete, using the credentials the user just created.

### Why not the alternatives
- *Set password via the user-context client:* would preserve the session but splits the flow across client/server
  and weakens the "client never writes its own identity" guarantee in `complete-account`.
- *complete-account returns a fresh session:* more moving parts (server-side session minting via generateLink +
  `setSession`) for no added robustness over client re-sign-in.

## Scope

- **Client only:** `apps/mobile/app/(auth)/create-account.tsx` `submit()`.
- **No** edge-function change — `complete-account` keeps doing the admin identifier-attach + server-side profile
  creation (preserves the identity-trust guarantee).
- **No** migration.

## Error handling

If `signInWithPassword` fails (unexpected — the account exists and the password was just set), surface an inline
error and route to `(auth)/sign-in` so the user logs in manually, rather than proceeding on a dead session.

## Verification

1. **Reproduce first (pre-fix):** fresh email-OTP signup on the simulator (local Supabase) → complete account →
   walk onboarding → confirm the bounce to sign-in and `active_sessions = 0`.
2. **Post-fix (email-started):** same flow → lands on Home, **no bounce**, session stays alive,
   `profiles.onboarded_at` set.
3. **Post-fix (phone-started):** sign up via phone OTP (test_otp `351912345678 = 123456`), secondary = email →
   same successful result via `signInWithPassword({ phone, password })`.
4. **Regression:** a normal returning login still works.
5. `pnpm -w typecheck`.

## Out of scope

- The returning-user email-OTP-code gap (Phase 1.2) and the chat-gate robustness (Phase 1.3) are separate slices.
- Invalidating other devices' sessions on credential change (already out of scope per the change-password spec).
