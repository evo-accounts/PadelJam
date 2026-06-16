# Phase 5C-2 — Auth Recovery Flow — Design

*Padel Jam • 2026-06-16 • Brainstormed design / spec*

## Goal

Add the auth recovery paths that hang off the OTP screen: a generic **Try-another-way** sheet,
**password sign-in** fallback (AU-11), **password recovery** via OTP to the entered identifier
(AU-12/13), and confirm **lazy secondary-identifier verification** (AU-07). Client + `@padel/auth`
only; no migration. Reuses the existing OTP infra and `getAuthTarget()` (carries `{ identifier, kind }`).

## Scope decisions (from the 5C / 5C-2 brainstorm)
1. **Generic sheet, no pre-auth account lookup** — the app knows only the identifier typed on the
   identifier-first screen. The sheet offers **Sign in with password** + **Use a different email/phone**
   (no channel-masking; the masked secondary-channel switch from AU-10 is intentionally out).
2. **Recovery OTP goes to the entered identifier** (email *or* phone), reusing the OTP infra (no lookup).
3. **AU-07: verify-and-fix-only** — the identifier-first OTP flow already verifies the secondary on
   first sign-in via it; confirm end-to-end, add a fix only if the unconfirmed secondary blocks OTP.
4. **Recovery success routes into the app** (the user is authenticated after the recovery OTP);
   spec's "back to login" copy is adjusted accordingly.

## Verified context
- `apps/mobile/app/(auth)/otp.tsx`: 6-box OTP, `otpReducer` (attempts/locked/cooldown,
  `MAX_ATTEMPTS=5`, `RESEND_COOLDOWN_MS=30_000`), reads `{ identifier, kind } = getAuthTarget()`,
  has a "Try another way" link (currently resets → sign-in).
- `@padel/auth`: `startEmailOtp`/`startPhoneOtp`/`verifyEmailOtp`/`verifyPhoneOtp`, `otpReducer`,
  `changePassword` (re-auth via `signInWithPassword` internally — no standalone export yet).
- `getAuthTarget()`/`setAuthTarget` in `apps/mobile/lib/auth-flow.ts` persist the identifier+kind.
- The root session listener / `Boot()` route an authed user to tabs/onboarding.

## Architecture / components

### `@padel/auth` (`packages/auth/src/password.ts` + `index.ts` export; `password.test.ts`)
- `signInWithPassword(c, identifier, kind, password)`:
  `c.auth.signInWithPassword(kind === 'phone' ? { phone: identifier, password } : { email: identifier, password })`
  → `{ data, error }`.
- `setPassword(c, password)`: `c.auth.updateUser({ password })` → `{ data, error }`.
- Unit tests mirroring `email-change.test.ts` (mock client, assert the right Supabase call).

### Try-another-way sheet (`apps/mobile/app/(auth)/otp.tsx`)
Change the "Try another way" link to open a modal sheet with two options:
- **Sign in with password** → `router.push('/(auth)/password')`.
- **Use a different email or phone** → `router.back()` (to the identifier screen).
Modal pattern mirrors the settings/notifications action sheets.

### Password sign-in (`apps/mobile/app/(auth)/password.tsx`)
- Reads `{ identifier, kind } = getAuthTarget()`; a single secure password field; Continue →
  `signInWithPassword` → on success the session is set (root listener/Boot routes onward; or
  `router.replace('/')`).
- **Rate-limit:** reuse `otpReducer` (attempts/locked) — count failed attempts; after `MAX_ATTEMPTS`
  in the 10-min window show the rate-limited message ("Too many attempts. Use Try another way or wait
  a few minutes."); wrong password before that → "That password doesn't match our records."
- **Forgot password?** link → `router.push('/(auth)/recovery')`.
- A "Try another way" link → `router.back()` to OTP (optional, matches 5.4).

### Password recovery (`apps/mobile/app/(auth)/recovery.tsx`, single screen, `step` state)
- **`code`**: on mount, send OTP to the entered identifier (`startEmailOtp`/`startPhoneOtp` by `kind`);
  6-box input + Resend (30s cooldown via `otpReducer`); verify (`verifyEmailOtp`/`verifyPhoneOtp`) →
  OTP-login (session set) → `setStep('password')`.
- **`password`**: New + Confirm fields (required, must match, ≥8 chars) → `setPassword` →
  `setStep('done')`.
- **`done`**: success message + a single CTA → `router.replace('/')` (authed → Boot routes to
  tabs/onboarding). AU-13 (other sessions invalidated) is Supabase's password-change behavior.

### AU-07 verification
Confirm: after `complete-account` sets the secondary identifier (unconfirmed), signing in via that
channel (identifier-first → OTP) succeeds and confirms it. If `signInWithOtp` to the unconfirmed
secondary is blocked, add the minimal fix (e.g. ensure the channel is OTP-eligible). Documented as a
verification step; no new UI expected.

### i18n (`auth` namespace)
Sheet (`tryAnotherWay`, `usePassword`, `useDifferentId`), password screen (`passwordTitle`,
`passwordPlaceholder`, `passwordWrong`, `passwordRateLimited`, `forgotPassword`, `continue`),
recovery (`recoveryTitle`, `recoveryCodeSent`, `newPasswordTitle`, `newPasswordLabel`,
`confirmPasswordLabel`, `passwordsDontMatch`, `passwordTooShort`, `recoveryDoneTitle`,
`recoveryDoneCta`).

## Error handling
- Password sign-in: inline wrong-password; rate-limit lock after 5 fails / 10 min.
- Recovery: OTP errors reuse the OTP screen's error handling (invalid/expired code, resend cooldown);
  password-policy errors inline; a `setPassword` failure shows inline (stay on `password` step).
- All flows tolerate the entered identifier being email or phone.

## Explicitly deferred
- Masked secondary-channel switching + account-specific options (AU-10 full) — needs a pre-auth lookup.
- Social (Apple/Google) recovery options in the sheet — Phase 5I.
- Production SMTP / SMS provider config — local inbucket / Twilio test token suffice to build.

## Conventions followed
`@padel/auth` helpers + unit tests (mirror `email-change.test.ts`); reuse `otpReducer` + the OTP
widget; screens under `(auth)/`; `useT('auth')`; `getAuthTarget()` for the identifier; modal sheet
pattern from settings/notifications.
