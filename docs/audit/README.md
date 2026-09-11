# Audit data

`pnpm seed:audit` puts the fixtures from "Padel Jam — Content for Audit" into a Supabase project.
`infra/seed/audit/out/audit-handover.<target>.md` (generated, git-ignored) lists accounts, codes and
ids for the auditor. `infra/seed/audit/out/manifest.<target>.json` (also git-ignored) is the
machine-readable record `verify.ts` reads back.

## Run

Local (development of the seed):

    export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
    pnpm dlx supabase@latest --workdir infra db reset
    pnpm seed:audit -- --target local
    node infra/seed/audit/verify.ts --target local

Hosted (the audit itself). Put these in `.env.audit` at the repo root (never committed):

    SUPABASE_URL=https://<project-ref>.supabase.co
    SUPABASE_ANON_KEY=...
    SUPABASE_SERVICE_ROLE_KEY=...
    EXPO_PUBLIC_STREAM_API_KEY=...

then

    pnpm seed:audit -- --target hosted --yes-hosted --purge
    node infra/seed/audit/verify.ts --target hosted --yes-hosted

`--purge` removes everything the cast owns and recreates it; run it before every audit session so live and
upcoming events are fresh relative to today.

## Hosted prerequisites (someone with owner rights)

1. Migrations 0091, 0092, 0093 applied through the dashboard SQL editor (plus the `schema_migrations` rows).
2. Edge function `send-push` redeployed (new notification copy).
3. Fixed phone codes registered under Authentication → Providers → Phone → Test phone numbers, for every
   phone the hand-over lists (A1, A2 and the acting users).
4. Stream secrets present on the edge functions (they are, if chat works in the shipped build).
5. Raise the Auth sign-in rate limit (Authentication → Rate Limits) or accept that the seed pauses
   ~65 s when it hits the per-IP cap on password sign-ins.

## Sign-in

All seeded accounts use the password `Padel1234#`. Email OTP on hosted goes to the real mailbox; use the
phone number with its fixed code instead. A2 (`newuser@padeljam.com`, `+351910000101`) is never created:
sign up with it to review onboarding, and re-run the seed with `--purge` to reset it.

## What the seed cannot honour

- Fixed codes for email OTP (GoTrue supports test codes for phone only).
- A private-profile flag and a `level` field: neither exists. Position maps to court side.
- Tie handling in the group ranking: the client ranks by a plain sort, so the seeded tie shows as consecutive ranks.
- Gender-aware pairing inside rounds: only the start block exists.
- `num_courts = 0`: the schema requires at least one court; E4 has no library courts assigned.
- G5 as a join request on a private group: the requirements rule that out; G5 is a pending invitation instead.
- The document's supporting-user table sums to 17, not 16; the seed creates 17 named users plus 13 crowd
  members (30 supporting accounts, 31 with A1). Of the 17 named users, U4, U5, F1, F2 and F3 sit outside
  C1/G1 by design (F1/F2/F3 own C2/C3/C4; U4 lives in C3's ranking group; U5 has a minimal profile), so
  G1 lands at 26 members (C1's roster plus A1), not a literal 30.
