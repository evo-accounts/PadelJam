# Phase 1B-2b — Notification Settings — Design

*Padel Jam • 2026-06-14 • Brainstormed design / spec*

## Goal

Store the user's three notification-channel preferences (Push / WhatsApp / Email) and expose a
toggle screen reached from the settings hub. Closes the notification-preferences part of
`Requirements/profile.md` PR-14. **Preferences only** — actual delivery (sending push/WhatsApp/
email) is the Phase 2 notifications system; this slice just persists the toggles.

**Decomposition:** part of Phase 1B-2 (settings). 1B-2a (hub + logout + language + legal) shipped;
this is **1B-2b**. Remaining: 1B-2c (account security), 1B-2d (app-icon, support).

Branch `feat/phase1b2b-notifications` (off the consolidated `feat/discovery-explore`).
**Migration `0057`.**

## Scope decisions (made with the user)

1. **Preferences only** (no delivery wiring).
2. **default-in-app + upsert** (no `get-or-create` RPC): a missing `user_settings` row means
   "all defaults"; the row is created on the first toggle.
3. Defaults per PR-14: **push on, WhatsApp off, email off**. No `language` column (language lives
   in `profiles.locale` from 1B-2a).

## Data model — migration `0057_user_settings.sql`

```sql
create table user_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  notifications_push     boolean not null default true,
  notifications_whatsapp boolean not null default false,
  notifications_email    boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table user_settings enable row level security;
grant select, insert, update on user_settings to authenticated;
create policy "user_settings: select" on user_settings for select using (user_id = auth.uid());
create policy "user_settings: insert" on user_settings for insert with check (user_id = auth.uid());
create policy "user_settings: update" on user_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
```

## Read/write (`@padel/api`)

- `qk.mySettings: (id) => ['user-settings', id]`.
- `useMySettings()` — `useQuery`, `db.from('user_settings').select('notifications_push, notifications_whatsapp, notifications_email').eq('user_id', uid).maybeSingle()`; returns the row, or the defaults `{ notifications_push: true, notifications_whatsapp: false, notifications_email: false }` when null. `enabled: !!uid`.
- `useUpdateSettings()` — `useMutation` taking the three booleans; `db.from('user_settings').upsert({ user_id: uid, notifications_push, notifications_whatsapp, notifications_email, updated_at: new Date().toISOString() })`; `onSuccess` invalidates `qk.mySettings(uid)`.
- New module `packages/api/src/settings/` (`queries.ts` + `mutations.ts`), exported from `src/index.ts`. (Kept separate from `profile/` since it's its own table/concern.)

## Mobile

- **`apps/mobile/app/profile/notifications.tsx`** (new, under the profile Stack) — reads `useMySettings()`; three rows, each `label + RN Switch`: Push, WhatsApp, Email. Flipping a switch updates local state and calls `useUpdateSettings().mutate({ ...current, [channel]: value })`. Loading spinner until the query resolves.
- **`apps/mobile/app/profile/settings.tsx`** — add a **Notifications** row in the Preferences section → `router.push('/profile/notifications')`.
- i18n (`profile` namespace): `notifications`, `notifPush`, `notifWhatsapp`, `notifEmail`.

## Testing

- **SQL** (`infra/supabase/tests/user_settings.sql`, PT001): as user A, `upsert` a row → reads back with the set values; a fresh insert without overrides yields the PR-14 defaults; user B cannot select or update user A's row (RLS).
- **`@padel/api`**: `qk.mySettings` key-shape test.
- **Type/typecheck**: hand-add the `user_settings` table to `database.types.ts`; `pnpm -w typecheck`.
- **Manual smoke** (JS): Settings → Notifications → toggle each switch → values persist across reopening the screen.

## Explicitly deferred (NOT 1B-2b)
- Sending notifications over any channel (Phase 2). Account security / password / OTP / delete (1B-2c).
  App-icon, support tickets (1B-2d). WhatsApp/email provider integration.

## Conventions followed
Additive migration `0057_user_settings.sql`; RLS own-row policies (mirror existing patterns); SQL
test with PT001; hand-add `database.types.ts`; `@padel/api` thin hooks (`useQuery`/`useMutation`)
with `qk` keys, exported from `src/index.ts`; RN built-in `Switch`; copy via `useT('profile')`.

## Open items for the implementation plan
- Confirm the `user_settings` row shape returned by `maybeSingle()` (nullable) and the in-app default merge.
- Confirm the settings-hub row placement (Preferences section, after Language).
