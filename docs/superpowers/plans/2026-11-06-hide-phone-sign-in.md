# Hide phone sign-in for launch

**Task:** PAD-252. **Decision:** founder, PAD-137, 11-05: hide, no Twilio spend. **Spec:** `docs/superpowers/specs/2026-11-05-launch-ready-checklist.md`, W1 and D2.
**Owners:** Engineer A (web, local config, docs), then Engineer B (mobile, suite 01), on one branch and one PR: `feat/hide-phone-sign-in`. **Approved by:** CTO, 2026-11-06.

**Target:** the next iOS build (PAD-140, row #2, 11-20) if it can make it, otherwise the build after. Web ships when the PR merges.

## Decisions

1. **One PR, no flag, code kept.** Same as the plans hide (D1): remove the entry points and leave the plumbing. `packages/auth` phone helpers, `PhoneField`, the `kind` branches in `otp.tsx`, `password.tsx`, `recovery.tsx`, `profile/change-phone.tsx` and `settings/phone/page.tsx` stay. Turning phone back on later means reverting this PR. Don't refactor them.
2. **No migration and no edge function change.** `complete-account` already treats both secondary identifiers as optional. Nothing here needs a hosted deploy.
3. **The privacy page is not touched** (gate 5). `/privacy` still names phone, which remains true of accounts that have one.

## What the server does with the provider off

Tested on a local stack (GoTrue v2.196.0) with `[auth.sms] enable_signup = false`, which is `external.phone: false` in `/auth/v1/settings`:

| Call | Result |
| --- | --- |
| `POST /otp` phone, known or new number | 400 `phone_provider_disabled` |
| `POST /resend` type sms | 400 `phone_provider_disabled` |
| `POST /signup` phone + password | 400 `phone_provider_disabled` |
| password grant with **phone** | 422 `phone_provider_disabled` |
| **`PUT /user` with a new phone** | **Still calls Twilio.** 422 `sms_send_failed` only because the local credentials are placeholders |
| refresh of a live phone-only session | 200 |
| `PUT /user` with an email, on that session | Reaches the send step (local run had no mail service) |
| password grant with email, on an account that also has a phone | 200 |
| admin create with `phone` + `phone_confirm` (the e2e persona fixtures) | 200 |

Hosted runs its own GoTrue version, so the founder's check reads the result on hosted rather than relying on this table alone.

Two things follow:

- **The toggle doesn't stop the spend.** Any signed-in user can still make hosted send an SMS through `PUT /user`, up to the 35-per-hour limit, while real Twilio credentials are set. Hiding the UI doesn't change that. So the founder also replaces the Twilio Auth Token with a placeholder.
- **The toggle does lock out phone-only accounts that are signed out,** including ones with a password. So the count comes first.

## Accounts that only have a phone

The founder runs a read-only count on hosted, then:

- **No phone-only account has a profile:** nobody can lose anything, since an account with no profile never finished sign-up. The founder applies the hosted change in the same sitting.
- **Some do:** the founder stops there, and the CTO decides with the count in hand. The routes are:
  - *Signed in on a device:* the session keeps refreshing, and Account > Email (which stays) adds an email. They sign in with that from then on.
  - *Signed out:* the founder attaches their email on hosted one account at a time. Contacting them is gate 3.

This doesn't block the build. The app behaves correctly whichever way the count goes.

## Order against the app

The hosted change is safe before any of this ships. Old builds and the live web already offer email on the same screen:

- phone sign-in shows an error instead of sending a code, and the user can switch to email;
- an old-build sign-up that enters a phone gets `sendCodeFailed` on the verify step, where "Skip for now" works.

So the founder's task runs now and the PR doesn't wait for it, nor it for the PR.

**Email becomes the default path,** and hosted email codes have never been checked live (PAD-144 step 6 was skipped). `magic_link` and `confirmation` hold `{{ .Token }}` locally but hosted templates are separate, so the founder's task also tests both.

## Engineer A: web, local config, docs

Do these first and push to `feat/hide-phone-sign-in`. No PR yet.

**Web**

- `apps/web/src/lib/identifier.ts` and `IdentifierStep.tsx`: the field accepts an email only. A phone number gets the "missing information" message, never `invalid_phone`, and nothing is sent. Input stays `type="text"`/`autoComplete="username"` unless you have a reason. `identifierLabel` and `identifierPlaceholder` say email, in all three locales.
- `CreateAccountStep.tsx`: remove the secondary field, because the primary is now always email. `canSubmit` needs name, password and terms. `useAuthFlow.completeAccount`: no secondary in the body, no verify step, straight to where the skip path goes. Leave `VerifySecondaryStep` and the rest of the secondary plumbing only if deleting them would widen the diff; if they become plainly unreachable from `useAuthFlow`, say which you left in the hand-off.
- `settings/account/page.tsx`: remove the phone row. `settings/phone/page.tsx` stays, unlinked.
- `(public)/help/page.tsx`: "Sign in with your phone or email" becomes email.
- Grep `apps/web/src` for other user-facing phone or SMS copy in the auth flow, including `telemóvel` and `celular`.

**Local config, so every test runs against what hosted will be**

- `infra/supabase/config.toml`: `[auth.sms] enable_signup = false`; delete `[auth.sms.test_otp]`; keep the placeholder Twilio block, which now matches hosted. Update the comments there and in `infra/supabase/README.md` (line 36).
- The personas keep their phones. Admin create works with the provider off (table above), so don't change the fixtures.

**Docs (`.md` only; the `.docx` originals are the founder's)**

- `Requirements/auth-onboarding.md`: replace "Every account links one email AND one phone" (line 32). Amend lines 30, 204, 221, 229, 317, 435, 465-469, 485, 489 and AU-03, AU-06, AU-09 (734-740) and the `NOT NULL` wording, marked as a launch decision citing PAD-137. The checklist's section 5 says how D1 was handled; follow that, and leave the description of the phone design readable for when it returns.
- `Requirements/profile.md` line 724 and PR-12: phone is not a sign-in identifier and can't be changed in the app at launch.
- `docs/handoff/sms-production-setup.md`: a note at the top that phone sign-in is hidden for launch (PAD-137) and that re-enabling means this doc plus reverting this PR, and restoring the real Twilio token.
- The checklist's W1/D2 rows and section 1.1 criteria 1-2: phone is out for launch.

## Engineer B: mobile, suite 01

Starts from Engineer A's commits on the same branch. Opens the PR.

- **`(auth)/sign-in.tsx`:** email only. Remove `mode`, `toggleMode`, the phone state, `PhoneField` and the third button (`sign-in-toggle-mode`). The `mode` param is ignored. `setAuthTarget(value, 'email', 'email')`. Rewrite the docblock, which now describes the opposite.
- **`lib/authMethods.ts`:** drop `'sms'` from `ORDER`, which removes the row from every "Try another way" sheet. An account whose only other method is SMS gets the sheet's existing empty state. Update `authMethods.test.ts` and `tryAnotherWayRows.test.ts`. The `sms` entries in `PRESENT` and `LABEL_KEY` stay, since the type does.
- **`otp.tsx`, `password.tsx` `onPick`:** the picks no longer pass `mode` to sign-in. Nothing else in these screens changes.
- **`(auth)/create-account.tsx`:**
  - `secondaryKind === 'phone'` means the primary is email (OTP or social), and then **no second-identifier field shows at all**. `canSubmit` needs name, password and terms. On success go straight to `goNext()`, with no `startSecondaryChange` and no verify phase.
  - Remove `PhoneField`, `phoneDigits`, `startPhoneChange` and `verifyPhoneChange` from this screen.
  - `secondaryKind === 'email'` (a session verified by phone before the switch) keeps its current email field and verify phase: it's how such an account gets an email. After the provider is off, its post-complete `signInWithPassword` by phone fails into the existing sign-in redirect. Don't add handling for that; the count decides if it ever matters.
- **`profile/account.tsx`:** remove `account-phone-row`. `change-phone.tsx` stays, unlinked. `change-email` stays.
- **`profile/change-password.tsx`:** `recoveryTarget` is the email or `null`. No phone branch, so "Forgot password?" can't send an SMS. The link already hides on `null`.
- **Copy in all three locales:** `useDifferentId` and `onlyWayInBody` ("email or phone") say email. Grep the `auth` and `profile` namespaces for others, including `telemóvel` and `celular`. Keep keys the retained screens still use, and remove only what `i18n:check` shows as unused.
- **E2E (`01-auth.e2e.ts`, `driver/flows.ts`, `fixtures/personas.ts`, `e2e/README.md`):**
  - Remove the phone validation, phone OTP happy path and toggle tests. `TEST_PHONE*` goes with them.
  - The fingerprints that look for `sign-in-phone-country` look for `sign-in-email`.
  - The sheet assertions that expect an SMS row (around lines 407, 412, 454, 599) now assert it is absent, and "different email or phone" becomes the new copy. Keep the check that a masked phone never appears.
  - The test around line 289 that matches on a verified phone is rebuilt on a new email account: it walks create-account with **no phone field** and lands in onboarding.
  - `switchToEmailMode` is called across the suites. Reduce it to waiting for the email field, rather than editing every caller, and rewrite its comment.
  - Add: sign-in shows no phone input and no "Continue with phone".
- **Don't** touch `plugins/`, build config or `eas.json`.

## Acceptance criteria

1. Mobile sign-in opens on email; no phone input or channel swap exists on it. Web's field takes email only, and a typed phone number sends nothing.
2. A new user can sign up by email OTP, Google or Apple without ever being asked for a phone, on mobile and web.
3. "Try another way" never offers SMS, for an account with or without a phone on file.
4. Account settings show no phone row on mobile or web. Change password's "Forgot password?" never targets a phone.
5. An existing account with email and phone signs in by email code and by password.
6. No user-facing "phone" sign-in copy is left in the auth flow, in pt-PT, pt-BR or en. The strings for retained, unlinked screens may stay.
7. All tests run against a provider-off local config. The hand-off checks are green, plus `pnpm test:db` and suite 01.
8. No migration, no edge function change, no diff to `/privacy` or `packages/auth`.

## Hosted hand-off

Only the founder's `Founder:` task, a child of PAD-252: the count, the Twilio token, the provider toggle, a live test of email codes. It doesn't gate the merge. No SQL besides the read-only count.

## After the merge

R&O updates `docs/handoff/store-readiness-gap-list.md` (I5, A7, A8, X2 and the beta criteria still call phone the primary path). The Head of Business is already correcting the launch plan (D8, #19, #21), as PAD-240 records.
