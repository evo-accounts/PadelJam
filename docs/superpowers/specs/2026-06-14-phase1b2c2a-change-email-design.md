# Phase 1B-2c-2a — Change Email (OTP) + Contact Sync — Design

*Padel Jam • 2026-06-14 • Brainstormed design / spec*

## Goal

Let a signed-in user change their email (OTP-verified) from settings, and keep
`profiles.email/phone` in sync with `auth.users` via a DB trigger. Closes the email part of
`Requirements/profile.md` PR-02 (email is OTP-verified). Phone-change deferred (not locally
testable with the fixed `test_otp` map).

**Decomposition:** Phase 1B-2c-2 = **1B-2c-2a (change email + sync trigger, this)** + 1B-2c-2b
(change phone, reuses the same trigger + flow). Email first.

Branch `feat/phase1b2c2-change-email` (off `main`). **Migration `0058`.**

## Scope decisions (made with the user)

1. **Email first**; phone-change deferred (local `test_otp` only covers fixed numbers).
2. **Single-code flow:** set `double_confirm_changes = false` in `infra/supabase/config.toml`
   so only the NEW email is confirmed (one 6-digit code). **Tradeoff:** weaker than secure
   email change (no proof of access to the OLD mailbox); **production should revisit** enabling
   secure email change, which would expand the UI to two codes. Documented here and in the migration/PR.
3. **Profiles sync via DB trigger** (robust for all change paths) rather than a client-side write.
4. **Single two-phase screen** (enter email → enter code) rather than two routes.

## Architecture

```
auth.users (email/phone changes) ──[after update trigger]──▶ profiles.email/phone synced
Settings › Account › Change email → /profile/change-email
  phase 'email': new email → updateUser({ email })  → GoTrue OTP to new email (Inbucket locally)
  phase 'code' : 6-digit    → verifyOtp({ email: new, token, type: 'email_change' })
                 → auth.users.email updated → trigger syncs profiles → invalidate profile → success
```

## Components

### Config — `infra/supabase/config.toml`
Set `double_confirm_changes = false` under `[auth.email]` (was `true`). Requires a Supabase
restart / `db reset` to take effect. (Comment the security tradeoff inline.)

### Migration `0058_profile_contact_sync.sql`
```sql
-- Keep profiles.email/phone in sync with auth.users after a verified email/phone change.
-- coalesce avoids nulling profiles' NOT NULL columns on a transient null on auth.users.
create or replace function sync_profile_contact()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set email = coalesce(new.email, profiles.email),
         phone = coalesce(new.phone, profiles.phone)
   where profiles.id = new.id;
  return new;
end;
$$;
create trigger sync_profile_contact_aiu
  after update of email, phone on auth.users
  for each row execute function sync_profile_contact();
```
(Trigger function is `SECURITY DEFINER` owned by postgres → may write `public.profiles` regardless of RLS. Mirrors the `handle_new_user` pattern of triggering off `auth.users`.)

### SQL test `infra/supabase/tests/profile_contact_sync.sql`
Seed an `auth.users` row + matching `profiles` row. As postgres:
- `update auth.users set email='new@x.com' where id=…` → assert `profiles.email='new@x.com'`.
- `update auth.users set phone='+351900000099' where id=…` → assert `profiles.phone` follows.
- `update auth.users set phone=null where id=…` → assert `profiles.phone` is **unchanged** (coalesce guard).

### `@padel/auth` — add to `packages/auth/src/otp.ts`
```ts
export const startEmailChange = (c: TypedClient, newEmail: string) => c.auth.updateUser({ email: newEmail });
export const verifyEmailChange = (c: TypedClient, newEmail: string, token: string) =>
  c.auth.verifyOtp({ email: newEmail, token, type: 'email_change' });
```
Unit test (mock client): `startEmailChange` calls `updateUser({ email })`; `verifyEmailChange` calls `verifyOtp({ email, token, type: 'email_change' })`.

### Mobile — `apps/mobile/app/profile/change-email.tsx`
Single screen, two phases via local state `phase: 'email' | 'code'`:
- **email**: `TextInput` (email, `keyboardType="email-address"`, `autoCapitalize="none"`) + Send-code button → `startEmailChange(supabase, email)`; on success show "code sent to {email}" and switch to `code` phase; error → inline.
- **code**: 6-digit `TextInput` + Verify → `verifyEmailChange(supabase, email, code)`; on success → invalidate `qk.profile(uid)` + `qk.myProfile(uid)`, success Alert, `router.back()`; error → inline (`invalidCode`).
- Settings hub: add a **Change email** row in the Account section (next to Change password).
- i18n (`profile` ns): `changeEmail`, `newEmailLabel`, `sendCode`, `codeLabel`, `verify`, `codeSentTo`, `emailChanged`, `changeEmailFailed`, `invalidCode`.

## Testing

- **SQL:** `profile_contact_sync.sql` (trigger sync + null guard) — the automated correctness gate.
- **`@padel/auth`:** unit test for `startEmailChange`/`verifyEmailChange`.
- **Type/typecheck:** no DB-type change needed (the trigger adds no table/column; `auth` helpers are typed). `pnpm -w typecheck`.
- **Manual smoke** (local Supabase restarted so the config applies): Settings → Account → Change email → enter a new email → read the 6-digit code from Inbucket (`localhost:55329` mail UI) → verify → profile shows the new email; re-login with the new email works.

## Explicitly deferred (NOT 1B-2c-2a)
- Change **phone** (1B-2c-2b). Secure email change / double-confirm two-code UX (prod follow-up).
  Delete account (1B-2c-3). Re-verifying an unverified secondary identifier on first sign-in (AU-07).

## Conventions followed
Additive migration `0058`; `security definer set search_path = public` trigger function; SQL test
(PT001); auth helpers in `@padel/auth` (unit-tested like `otp.ts`/`password.ts`); screen under
`apps/mobile/app/profile/` Stack; copy via `useT('profile')`; uses `@/lib/supabase`.

## Open items for the implementation plan
- Confirm the Inbucket port for reading the local email-change code (config `[inbucket] port`).
- Confirm `verifyOtp` accepts `type: 'email_change'` in the installed supabase-js types (it does in v2).
- After editing `config.toml`, the plan must `supabase stop && start` (or `db reset`) so GoTrue reloads `double_confirm_changes`.
