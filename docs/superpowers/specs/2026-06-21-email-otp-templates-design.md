# Email OTP Code Templates — Design

**Slice:** Phase 1.2 (launch blocker) from the requirements-audit roadmap.

## Problem

The app shows a **6-digit OTP entry screen** for every email-based auth flow (sign-in, signup, password
recovery, change-email) and calls `verifyOtp` with the typed code. But no custom email templates exist, so
GoTrue serves its **default** templates, which are **link-only** — they contain `{{ .ConfirmationURL }}` but
not `{{ .Token }}`. Result: the email has no 6-digit code, so users cannot complete the OTP screen.

Reproduced locally (current state): triggering email OTP for both a brand-new and an existing user produces a
"Your sign-in link" email with **no 6-digit code**. SMS is unaffected — `[auth.sms].template` already renders
`{{ .Code }}`.

## Approach (chosen)

Add custom email templates that surface the 6-digit `{{ .Token }}` as the primary content, with the magic link
kept as a secondary fallback, and wire them in `config.toml`. No app code changes — the app already shows the
code screens and verifies the code.

### Templates (create under `infra/supabase/templates/`)
Cover every code-bearing email flow:
- `magic_link.html` — email sign-in (existing users; with `enable_confirmations = false`, new-user
  `signInWithOtp` also uses this template).
- `confirmation.html` — signup confirmation (covers the signup path if/when confirmations are enabled).
- `recovery.html` — password reset (forgot-password OTP screen).
- `email_change.html` — change-email confirmation (settings OTP screen).

Each template shares one simple, inline-styled layout (PadelJam wordmark, the **code shown large**, a
"expires in 10 minutes" note, and a secondary "or use this link: `{{ .ConfirmationURL }}`" line). Single
language (English) — see Out of scope.

### Config (`infra/supabase/config.toml`, under `[auth.email]`)
Add a block per type:
```toml
[auth.email.template.magic_link]
subject = "Your PadelJam sign-in code"
content_path = "./supabase/templates/magic_link.html"

[auth.email.template.confirmation]
subject = "Confirm your PadelJam account"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.recovery]
subject = "Reset your PadelJam password"
content_path = "./supabase/templates/recovery.html"

[auth.email.template.email_change]
subject = "Confirm your new email"
content_path = "./supabase/templates/email_change.html"
```
`content_path` is relative to the CLI workdir (`infra`), matching the existing commented example
(`./supabase/templates/invite.html`). The implementer confirms the path resolves on `supabase start`.

## Verification

Restart the local stack (`pnpm dlx supabase@latest --workdir infra stop && … start`), then for each flow confirm
the Mailpit email contains a 6-digit code (and still includes the link):
1. **Sign-in (existing):** OTP to an existing user → email has a 6-digit `{{ .Token }}`.
2. **Sign-in/signup (new):** OTP to a fresh email → email has a 6-digit code.
3. **Recovery:** trigger password reset → email has a 6-digit code.
4. **Email change:** trigger a change-email → email has a 6-digit code.
End-to-end smoke: complete an email-OTP sign-in on the simulator using the code from Mailpit.

## Production note

Hosted Supabase manages email templates in the **dashboard** (Authentication → Email Templates). This slice
fixes **local**; replicating the same four templates in the production dashboard is a documented step folded
into Phase 1.4 (operational setup / handoff).

## Out of scope

- Localizing email copy (GoTrue templates are single-language; app i18n does not extend to emails).
- SMS templates (already render the code).
- `double_confirm_changes` production hardening (separate roadmap item / C6).
