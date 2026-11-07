# Bound `auth_methods_for` across all identifiers (PAD-159)

Written and approved by the CTO. Found in the PAD-156 audit, on the local stack. Not verified on production.

## The problem

An anon caller can check any number of emails and phones for an account. The identifier limit (5 per 15 min) bounds one identifier only. The address limit (30 per 15 min) keys on the first `x-forwarded-for` value, which the client chooses, and doesn't exist when the header is absent.

## The decision

Keep what "Try another way" shows, and bound how often anyone can ask.

- **No OTP gate on the answer.** The sheet is for people who can't get a code, and `sign-in.tsx:113` looks up before the send because the send creates the account. Asking for proof of control first would remove the feature.
- **No edge function or CAPTCHA now.** It's a new service to sign up for and needs a client change and a store build. It stays the next step if the cap proves too loose.

## The change

One migration, `create or replace function auth_methods_for`, starting from the body in `0101` (the latest definition; `git grep` first to confirm nothing later replaced it). Take the next free number when you open the PR: `0149` is already used on the PAD-133 branch, and other security fixes are in flight.

1. **Global bucket.** Add `c_global_limit constant integer := 120` and a fixed bucket `'global'`. Count it after the identifier and address checks. Over the limit, raise the same `rate_limited`. Insert one `'global'` row per allowed call.
2. **Better address key.** Use `cf-connecting-ip` when present, otherwise the first `x-forwarded-for` value, as today. Cloudflare overwrites that header, so if the hosted gateway passes it on, the address limit becomes real. If it doesn't, nothing is worse than today. Don't switch to the last `x-forwarded-for` value: it could be an internal hop on hosted, which would put every user in one 30-call bucket.
3. **Keep:** `set search_path = public, pg_temp`, the grants to `anon` and `authenticated`, and a self-check that anon can still execute it, as in `0136`.
4. **Correct the comments.** The header comment should say the global bucket is what bounds bulk lookups. It should also correct 0096's claim that an unknown identifier looks the same as a real account: a real email account answers `has_email: true`, an unknown one all-false.

**Why 120 per 15 minutes.** `sign-in.tsx` makes one lookup per email or phone sign-in start, so the cap has to clear real sign-ins, about 8 a minute. Going over it doesn't block anyone: `lookupAuthMethods` returns `null`, the code is still sent, and the sheet shows its only-way-in state, then retries when opened.

**What's left, on purpose:**
- About 11,500 lookups a day remain possible if the address limit can be spoofed.
- Someone holding the cap at its limit degrades the sheet for everyone, but not sign-in.
- Concurrent calls can overshoot the cap by about the connection pool's size, because the count and insert aren't atomic. No lock needed.

No client change, no edge function, no store build.

## Tests (`infra/supabase/tests/auth-methods.test.mjs`)

`anonRpc` takes no headers, so add an optional headers argument in `lib.mjs` without changing existing callers.

- Rotating `x-forwarded-for` and a new identifier each call: answers 120, refuses call 121. This is the finding's reproduction.
- The same with no address header at all: refuses call 121.
- Fixed `cf-connecting-ip`, rotating `x-forwarded-for`: refuses call 31.
- After `ageLedger(20)`, the next call answers.
- A refused call adds no ledger rows.
- Update `the window expiring resets the count`: a call now writes up to three rows, so `left.length <= 2` becomes `<= 3`.

## Check before the PR

- The migration has no `delete from`, `drop` or `truncate` outside the function body, so the `Migration check` doesn't hold it as destructive.
- `apps/mobile/e2e/suites/01-auth.e2e.ts` and `packages/db/src/database.types.ts`: no change expected, since the signature and columns are the same. Confirm the auth suite can't reach 120 lookups in 15 minutes.
