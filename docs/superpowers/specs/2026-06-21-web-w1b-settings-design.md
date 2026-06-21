# Web W1b — Settings Hub — Design

**Slice:** Web W1b (second half of WEB roadmap W1). Completes the W1 goal (profile + social + settings) begun in
W1a. This slice = the settings hub.

## Goal

Mirror the mobile settings hub on web: a settings index plus notifications, change password, change email (OTP),
delete account, support, language, and logout — reusing `@padel/auth` + `@padel/api`.

## Routes (under `apps/web/src/app/(app)/app/settings/`, auth-gated by W0 middleware)

- **`/app/settings`** — hub (grouped list):
  - **Account** → Change email, Change password
  - **Preferences** → Notifications, Language (a `Select`: en / pt-PT / pt-BR)
  - **Support** → Contact support; Terms & Privacy (external links to padeljam.app)
  - **Log out** (destructive) → `signOut(client)` → `/auth`
  - **Delete account** (destructive, bottom) → `/app/settings/delete`
- **`/app/settings/notifications`** — three `Switch` toggles (push / whatsapp / email) seeded from
  `useMySettings()` (`notifications_push|whatsapp|email`), persisted via `useUpdateSettings()` (optimistic; revert
  on error).
- **`/app/settings/password`** — current / new / confirm. Validate new ≥ 8 chars and new === confirm, then
  `changePassword(client, email, current, new)` (email from `useMyProfile`/session). Map the discriminated
  result: `current_password_wrong` and `update_failed` → inline errors; `{ ok: true }` → success + back to hub.
- **`/app/settings/email`** — two steps: (1) new email `Input` → `startEmailChange(client, newEmail)` (sends an
  OTP to the new address — the Phase 1.2 `email_change` template carries the 6-digit code); (2) 6-digit code →
  `verifyEmailChange(client, newEmail, code)` → success → hub.
- **`/app/settings/delete`** — warning text listing erased data (profile, memberships, social, messages), an
  `AlertDialog` confirm → POST `${SUPABASE_URL}/functions/v1/delete-account` with the session access token
  (mirror the mobile call) → on success `signOut(client)` → `/auth`.
- **`/app/settings/support`** — title + description `Input`/`Textarea` → `useCreateSupportTicket({ title,
  description })` → success state ("we'll respond within ~5 days").

## Language switch

The Language `Select` on the hub: on change, `useUpdateProfile({ locale })` to persist + call the live i18n
instance's `changeLanguage(locale)` so the UI updates immediately. (The i18n instance is created in
`Providers.tsx`; expose `changeLanguage` via the `useT`/i18next instance — `i18next` exposes
`i18n.changeLanguage` through `useTranslation().i18n`.)

## New shadcn primitives

`switch`, `alert-dialog`, `label` are not in W0's set — pull them (studio/base registry; creds already in
`apps/web/.env.local`) into `@/components/ui`.

## Entry point

Add a **Settings** link/button on `/app/profile` (own profile) pointing to `/app/settings`.

## Reuse

- `@padel/auth`: `changePassword`, `startEmailChange`, `verifyEmailChange`, `signOut`.
- `@padel/api`: `useMySettings`, `useUpdateSettings`, `useCreateSupportTicket`, `useUpdateProfile` (locale).
- Supabase browser client `@/lib/supabase/client`; `SUPABASE_URL` for the delete-account fetch.
- New `settings` i18n namespace (en / pt-PT / pt-BR) via `registerWebSettingsCopy`, called from `Providers.tsx`.

## Error / edge handling

- Notifications: optimistic toggle, revert + inline error on failure.
- Password: surface `current_password_wrong` distinctly from `update_failed`.
- Email change: invalid email + invalid/expired code inline errors.
- Delete: irreversible — require explicit `AlertDialog` confirmation before the call; on success the session is
  gone, so route to `/auth`.

## Out of scope

- **App icon** (native-only; N/A on web).
- **Subscription** (Phase 3; web billing is the dashboard/Stripe track, not player-web).
- DOB / gender / mobile-number account-field editing and phone-number change (minor; can fold into profile edit
  later).

## Verification

`pnpm --filter web typecheck` + `build`; browser (local Supabase, headless Chrome): toggle a notification
(persists across reload), change password (wrong-current shows the right error; valid succeeds), change-email OTP
round-trip (code from Mailpit `:55324`), submit a support ticket (a `support_tickets` row), language switch flips
UI copy, delete-account → signed out to `/auth`, logout works.
