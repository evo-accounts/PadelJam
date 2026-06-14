# Phase 1B-2c-1 — Change Password — Design

*Padel Jam • 2026-06-14 • Brainstormed design / spec*

## Goal

Let a signed-in user change their password (current + new + repeat) from the settings hub.
Closes the change-password part of `Requirements/profile.md` PR-11. No new tables/migration/edge
function — reuses the Supabase auth client.

**Decomposition:** Phase 1B-2c (account security) = **1B-2c-1 (change password, this)**, 1B-2c-2
(email/phone OTP re-verify), 1B-2c-3 (delete account). Change password first.

Branch `feat/phase1b2c-password` (off the consolidated `feat/discovery-explore`). **No migration.**

## Scope decisions (made with the user)

1. **Change password first**; OTP re-verify and delete account deferred to later 1B-2c slices.
2. **Verify current via `signInWithPassword`** (Supabase has no dedicated "check current
   password" call; this is the standard pattern), rather than GoTrue secure-password-change
   reauth nonces.
3. **Forgot-password link deferred** — the recovery flow (PR-12 / auth doc) doesn't exist yet.

## Architecture / flow

```
Settings hub › Account › Change password → /profile/change-password
  fields: current, new, repeat (all secureTextEntry)
  client validation: new.length >= 8, new === repeat
  changePassword(supabase, email, current, new):
    1) signInWithPassword({ email, password: current })   // verifies current (same user)
    2) on success → updateUser({ password: new })
  result: ok → success message + router.back(); else inline error
```
`email` from `useSession().session?.user.email` (every user has email — `complete-account` requires it).

## Components

- **`@padel/auth` — `packages/auth/src/password.ts`** (new, exported from `index.ts`):
  ```ts
  export type ChangePasswordResult = { ok: true } | { ok: false; reason: 'current_password_wrong' | 'update_failed' };
  export const changePassword = async (
    c: TypedClient, email: string, currentPassword: string, newPassword: string,
  ): Promise<ChangePasswordResult> => {
    const { error: verifyErr } = await c.auth.signInWithPassword({ email, password: currentPassword });
    if (verifyErr) return { ok: false, reason: 'current_password_wrong' };
    const { error: updateErr } = await c.auth.updateUser({ password: newPassword });
    if (updateErr) return { ok: false, reason: 'update_failed' };
    return { ok: true };
  };
  ```
- **`apps/mobile/app/profile/change-password.tsx`** (new, profile Stack) — three `TextInput`
  (`secureTextEntry`) for current/new/repeat + a Save button. On Save: validate (new ≥ 8 →
  `passwordTooShort`; new !== repeat → `passwordsDontMatch`), then `changePassword(supabase,
  email, current, new)`; `ok` → show `passwordChanged`, clear fields, `router.back()`; else map
  `reason` (`current_password_wrong` → that message; `update_failed` → generic). Save disabled
  while submitting.
- **Settings hub** (`apps/mobile/app/profile/settings.tsx`) — add an **Account** section
  (`<Text style={styles.section}>{t('account')}</Text>`) with a **Change password** row →
  `router.push('/profile/change-password')`, placed above Legal.
- i18n (`profile` ns): `account`, `changePassword`, `currentPassword`, `newPassword`,
  `repeatPassword`, `passwordTooShort`, `passwordsDontMatch`, `currentPasswordWrong`,
  `updateFailed`, `passwordChanged`.

## Testing

- **Unit** (`packages/auth/src/password.test.ts`, vitest, mirrors `otp.test.ts`): with a mock
  client (`auth.signInWithPassword`/`auth.updateUser` as `vi.fn`):
  - both succeed → `{ ok: true }`, `updateUser` called with the new password;
  - `signInWithPassword` returns an error → `{ ok: false, reason: 'current_password_wrong' }` and `updateUser` **not** called;
  - `updateUser` returns an error → `{ ok: false, reason: 'update_failed' }`.
- Workspace typecheck.
- **Manual smoke** (against local Supabase, real auth): change the password; re-login with the
  new password succeeds and the old one fails; entering a wrong current password shows the error.

## Explicitly deferred (NOT 1B-2c-1)
- Email/phone OTP re-verify (1B-2c-2); delete account (1B-2c-3). Forgot-password recovery (PR-12 / auth doc).
- Session invalidation of other devices on password change (AU-13) — out of scope here.

## Conventions followed
No migration. New auth helper in `@padel/auth` (pure-ish, unit-tested like `otp.ts`); screen under
`apps/mobile/app/profile/` Stack; copy via `useT('profile')`; uses the existing `@/lib/supabase` client.

## Open items for the implementation plan
- Confirm `TypedClient.auth.signInWithPassword` / `updateUser` are typed (it's the supabase-js client — yes).
- Confirm the settings-hub Account-section placement (above Legal) and styling reuse (`styles.section`, `styles.row`, `styles.rowLabel`).
