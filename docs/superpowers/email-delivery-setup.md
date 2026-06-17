# Email Delivery Setup (Resend)

This project delivers two kinds of email through [Resend](https://resend.com):

- **Roster CSV** — `send-roster-csv` emails the organizer their event's attendance & revenue CSV as an attachment (JM-46).
- **Blasts** — `send-blast` emails opted-in members when an organizer sends a blast that includes the `email` channel.

Both are Supabase Edge Functions (Deno) that call organizer-gated RPCs as the caller. They need a Resend API key and a verified sending address. Until those are configured, the functions return `email_not_configured` and the app shows a friendly "email delivery isn't set up yet" message — nothing breaks.

> WhatsApp and push delivery are **deferred**. `send-blast` intentionally handles only the `email` channel today.

## 1. Create a Resend account

Sign up at <https://resend.com>. The free tier is enough for development/testing.

## 2. Verify a sending domain

1. In the Resend dashboard go to **Domains → Add Domain**.
2. Add the domain you'll send from (e.g. `padeljam.app`).
3. Add the DNS records Resend shows (SPF / DKIM / return-path) to your DNS provider.
4. Wait for the domain to show **Verified**.

You can send from any address on a verified domain, e.g. `Padel Jam <noreply@padeljam.app>`.

> For quick local testing you can use Resend's `onboarding@resend.dev` sender, which only delivers to your own account email — fine for a smoke test, not for real recipients.

## 3. Create an API key

In Resend go to **API Keys → Create API Key** (send-only scope is sufficient). Copy the key (`re_...`); you only see it once.

## 4. Set the environment variables

These two variables drive both functions:

| Variable | Example | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | `re_xxxxxxxx` | Resend API key |
| `RESEND_FROM_EMAIL` | `Padel Jam <noreply@padeljam.app>` | Verified sender address |

### Local

Add them to your local `.env` (see `.env.example`):

```bash
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM_EMAIL=Padel Jam <noreply@padeljam.app>
```

`infra/supabase/config.toml` wires these into the local edge runtime via env interpolation:

```toml
[edge_runtime.secrets]
RESEND_API_KEY = "env(RESEND_API_KEY)"
RESEND_FROM_EMAIL = "env(RESEND_FROM_EMAIL)"
```

### Cloud

Set the same two as function secrets on your project:

```bash
pnpm dlx supabase@latest --workdir infra secrets set RESEND_API_KEY=re_xxxxxxxx
pnpm dlx supabase@latest --workdir infra secrets set "RESEND_FROM_EMAIL=Padel Jam <noreply@padeljam.app>"
```

## 5. Serve the functions locally

```bash
pnpm dlx supabase@latest --workdir infra functions serve
```

This serves `send-roster-csv` and `send-blast` against your local stack, picking up the env vars above.

## 6. Smoke test

### Email me the CSV

1. As an organizer, open an event you manage → **Manage** → **Export attendance** → **Email me the CSV**.
2. Confirm an email arrives at your account address with a `roster.csv` attachment whose first line is the header row.

### Blast email

1. As an organizer, send a blast that includes the **email** channel.
2. Confirm members who opted into email notifications (`user_settings.notifications_email = true`) and are active participants receive the blast email.

## Troubleshooting

- **`email_not_configured`** — `RESEND_API_KEY` and/or `RESEND_FROM_EMAIL` are unset where the function runs. Re-check `.env` (local) or function secrets (cloud) and restart `functions serve`.
- **`resend_failed:<status>`** — Resend rejected the request. A `403`/`422` usually means the `from` address isn't on a verified domain, or the API key is wrong/over-scoped.
- **No email but `{ ok: true }`** — for a blast, there may be no opted-in recipients, or the blast didn't include the `email` channel (`{ ok: true, sent: 0 }`).
