# Email OTP Code Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make email auth emails (sign-in, signup, recovery, change-email) include the 6-digit OTP code the app's screens expect, by adding custom GoTrue templates.

**Architecture:** Add four static HTML email templates that surface `{{ .Token }}` (the code) prominently with `{{ .ConfirmationURL }}` as a secondary link, and reference them from `config.toml` `[auth.email.template.*]`. No app code changes; verification is by inspecting the rendered emails in Mailpit.

**Tech Stack:** Supabase CLI (local GoTrue), TOML config, static HTML.

**Spec:** [docs/superpowers/specs/2026-06-21-email-otp-templates-design.md](specs/2026-06-21-email-otp-templates-design.md)

---

## Task 1: Create the four email templates + wire config

**Files:**
- Create: `infra/supabase/templates/magic_link.html`
- Create: `infra/supabase/templates/confirmation.html`
- Create: `infra/supabase/templates/recovery.html`
- Create: `infra/supabase/templates/email_change.html`
- Modify: `infra/supabase/config.toml` (add four `[auth.email.template.*]` blocks)

- [ ] **Step 1: Create `infra/supabase/templates/magic_link.html`**

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td style="font-size:20px;font-weight:700;color:#0B1F3A;padding-bottom:12px;">PadelJam</td></tr>
          <tr><td style="font-size:16px;font-weight:700;color:#0B1F3A;padding-bottom:4px;">Your sign-in code</td></tr>
          <tr><td style="font-size:14px;color:#6B7685;padding-bottom:20px;">Enter this code in the app to sign in.</td></tr>
          <tr><td style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0B1F3A;background:#f4f6fa;border-radius:12px;text-align:center;padding:18px 0;">{{ .Token }}</td></tr>
          <tr><td style="font-size:13px;color:#8A95A5;padding-top:16px;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</td></tr>
          <tr><td style="font-size:12px;color:#8A95A5;padding-top:16px;">Prefer a link? <a href="{{ .ConfirmationURL }}" style="color:#0B7BFF;">Tap here to sign in</a>.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
```

- [ ] **Step 2: Create `infra/supabase/templates/confirmation.html`**

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td style="font-size:20px;font-weight:700;color:#0B1F3A;padding-bottom:12px;">PadelJam</td></tr>
          <tr><td style="font-size:16px;font-weight:700;color:#0B1F3A;padding-bottom:4px;">Confirm your account</td></tr>
          <tr><td style="font-size:14px;color:#6B7685;padding-bottom:20px;">Enter this code in the app to finish creating your account.</td></tr>
          <tr><td style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0B1F3A;background:#f4f6fa;border-radius:12px;text-align:center;padding:18px 0;">{{ .Token }}</td></tr>
          <tr><td style="font-size:13px;color:#8A95A5;padding-top:16px;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</td></tr>
          <tr><td style="font-size:12px;color:#8A95A5;padding-top:16px;">Prefer a link? <a href="{{ .ConfirmationURL }}" style="color:#0B7BFF;">Tap here to confirm</a>.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
```

- [ ] **Step 3: Create `infra/supabase/templates/recovery.html`**

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td style="font-size:20px;font-weight:700;color:#0B1F3A;padding-bottom:12px;">PadelJam</td></tr>
          <tr><td style="font-size:16px;font-weight:700;color:#0B1F3A;padding-bottom:4px;">Reset your password</td></tr>
          <tr><td style="font-size:14px;color:#6B7685;padding-bottom:20px;">Enter this code in the app to reset your password.</td></tr>
          <tr><td style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0B1F3A;background:#f4f6fa;border-radius:12px;text-align:center;padding:18px 0;">{{ .Token }}</td></tr>
          <tr><td style="font-size:13px;color:#8A95A5;padding-top:16px;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</td></tr>
          <tr><td style="font-size:12px;color:#8A95A5;padding-top:16px;">Prefer a link? <a href="{{ .ConfirmationURL }}" style="color:#0B7BFF;">Tap here to reset</a>.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
```

- [ ] **Step 4: Create `infra/supabase/templates/email_change.html`**

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td style="font-size:20px;font-weight:700;color:#0B1F3A;padding-bottom:12px;">PadelJam</td></tr>
          <tr><td style="font-size:16px;font-weight:700;color:#0B1F3A;padding-bottom:4px;">Confirm your new email</td></tr>
          <tr><td style="font-size:14px;color:#6B7685;padding-bottom:20px;">Enter this code in the app to confirm your new email address.</td></tr>
          <tr><td style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0B1F3A;background:#f4f6fa;border-radius:12px;text-align:center;padding:18px 0;">{{ .Token }}</td></tr>
          <tr><td style="font-size:13px;color:#8A95A5;padding-top:16px;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</td></tr>
          <tr><td style="font-size:12px;color:#8A95A5;padding-top:16px;">Prefer a link? <a href="{{ .ConfirmationURL }}" style="color:#0B7BFF;">Tap here to confirm</a>.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
```

- [ ] **Step 5: Wire templates in `infra/supabase/config.toml`.** Insert these four blocks immediately **before** the `[auth.sms]` line (i.e. after the commented-out `[auth.email.notification.password_changed]` example). `content_path` is relative to the CLI workdir (`infra`):

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

- [ ] **Step 6: Commit**

```bash
git add infra/supabase/templates infra/supabase/config.toml
git commit -m "feat(auth): custom email templates with 6-digit OTP code (Phase 1.2)"
```

---

## Task 2: Restart stack + verify codes render

No code. Validates that GoTrue applies the templates and each email now carries a 6-digit code. The local Supabase stack uses `--workdir infra`.

- [ ] **Step 1: Restart the local stack to apply the config**

```bash
cd /Users/joaopaulos4/Cursor/PadelJam
pnpm dlx supabase@latest --workdir infra stop
pnpm dlx supabase@latest --workdir infra start
```
Expected: starts cleanly. If `supabase start` errors on a template path, fix the `content_path` (it must resolve to `infra/supabase/templates/<file>.html` from the workdir) and restart.

- [ ] **Step 2: Trigger sign-in (magic_link) + recovery emails**

```bash
ANON='sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
# magic_link (existing user)
curl -s -o /dev/null -w "otp %{http_code}\n" -X POST "http://127.0.0.1:55321/auth/v1/otp" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  --data '{"email":"runner@padeljam.test","create_user":false}'
# recovery
curl -s -o /dev/null -w "recover %{http_code}\n" -X POST "http://127.0.0.1:55321/auth/v1/recover" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  --data '{"email":"runner@padeljam.test"}'
```
Expected: both return `200`.

- [ ] **Step 3: Confirm the emails now contain a 6-digit code + the custom subjects**

```bash
python3 -c "
import json,urllib.request,re
ms=json.load(urllib.request.urlopen('http://127.0.0.1:55324/api/v1/messages?limit=6'))['messages']
for m in ms:
    if any(t['Address']=='runner@padeljam.test' for t in m.get('To',[])):
        full=json.load(urllib.request.urlopen('http://127.0.0.1:55324/api/v1/message/'+m['ID']))
        body=(full.get('Text') or '')+(full.get('HTML') or '')
        print(repr(m['Subject']),'| code:', (re.findall(r'\b\d{6}\b',body)[:1] or 'NONE'), '| has link:', '{{' not in body and 'http' in body)
"
```
Expected: a "Your PadelJam sign-in code" message and a "Reset your PadelJam password" message, **each with a 6-digit code** and a working link (no unrendered `{{ }}`).

- [ ] **Step 4: End-to-end smoke (simulator).** On the iOS simulator (local Supabase), do an email-OTP sign-in: enter an email → read the 6-digit code from Mailpit (`http://127.0.0.1:55324`) → enter it → confirm the app accepts it and proceeds. (`email_change` and `confirmation` use the same wiring; full interactive checks of those fold into the Phase 1.5 on-device pass — `confirmation` isn't separately triggerable while `enable_confirmations = false`, and new-user sign-in uses `magic_link`.)

---

## Verification (summary)
- Restart applies templates (Task 2 Step 1); magic_link + recovery emails carry a 6-digit code with custom subjects (Steps 2–3); simulator email-OTP sign-in works end-to-end (Step 4).
- Finish via superpowers:finishing-a-development-branch (merge to `main` after review).

## Out of scope
Production dashboard templates (Phase 1.4/handoff); email localization; SMS (already has its code); `double_confirm_changes`.
