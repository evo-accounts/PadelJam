# Phase 1B-2d-1 — Support (Contact + section) — Design

*Padel Jam • 2026-06-14 • Brainstormed design / spec*

## Goal

Let a user contact support (a ticket form) and add a Support section to settings (Contact
support, Help center, Share the app). Closes the support part of `Requirements/profile.md`
PR-11/PR-12. Branch `feat/phase1b2d-support` (off `main`). **Migration `0060`.**

**Decomposition:** Phase 1B-2d = **1B-2d-1 (support, this)** + 1B-2d-2 (app-icon picker — native,
deferred: needs alternate-icon assets + a config plugin + a rebuild, not locally testable).

## Scope decisions (made with the user)

1. **Contact-support is the real feature** (table + form). **Help center** = external link;
   **Share the app** = RN `Share`. **"Rate the app" deferred** (needs App Store/Play IDs or
   `expo-store-review`). **App-icon picker deferred** (1B-2d-2).
2. **Fire-and-forget insert** with an SLA confirmation — no ticket-list screen (PR-12 "we'll get back to you").

## Data model — migration `0060_support_tickets.sql`

```sql
create table support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  description text not null,
  status      text not null default 'open' check (status in ('open','responded','closed')),
  created_at  timestamptz not null default now()
);
alter table support_tickets enable row level security;
grant select, insert on support_tickets to authenticated;
create policy "support_tickets: select" on support_tickets for select using (user_id = auth.uid());
create policy "support_tickets: insert" on support_tickets for insert with check (user_id = auth.uid());
```

## API — extend the `settings` module

`useCreateSupportTicket()` in `packages/api/src/settings/mutations.ts`:
```ts
export const useCreateSupportTicket = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (input: { title: string; description: string }) => {
      const { error } = await db.from('support_tickets').insert({
        user_id: uid!,
        title: input.title,
        description: input.description,
      });
      if (error) throw error;
    },
  });
};
```
Fire-and-forget — no `qk`/invalidation (no list query).

## Mobile

- **`apps/mobile/app/profile/support.tsx`** — contact form: `title` `TextInput` + `description`
  (multiline) + **Send**. Validate both non-empty (else inline `supportFailed`-style message);
  on submit `useCreateSupportTicket().mutateAsync(...)`; success → `Alert` with `supportSent`
  (SLA copy) → `router.back()`; error → inline. `busy` guard.
- **Settings hub** (`apps/mobile/app/profile/settings.tsx`) — a **Support** section above Legal:
  - **Contact support** → `router.push('/profile/support')`.
  - **Help center** → `Linking.openURL(HELP_URL)` (`HELP_URL = 'https://padeljam.app/help'` constant near the existing `TERMS_URL`/`PRIVACY_URL`).
  - **Share the app** → `Share.share({ message: t('shareMessage') })` (RN `Share`).
- i18n (`profile` ns): `support`, `contactSupport`, `supportTitle`, `supportDescription`,
  `supportSend`, `supportSent` ("Thanks — we'll get back to you within 5 days."), `helpCenter`,
  `shareApp`, `shareMessage`, `supportFailed`.

## Testing

- **SQL** (`support_tickets.sql`, PT001): user A inserts a ticket → reads it back with
  `status='open'`; user B cannot `select` A's ticket (RLS).
- **Type/typecheck:** hand-add `support_tickets` to `database.types.ts` (the `db.from('support_tickets')`
  insert needs the table typed); `pnpm -w typecheck`.
- **Manual smoke:** Settings → Support → Contact support → fill title+description → Send → SLA alert
  → back; Help center opens the browser; Share opens the share sheet.

## Explicitly deferred (NOT 1B-2d-1)
- App-icon picker (1B-2d-2, native). "Rate the app" (store IDs / `expo-store-review`). A
  ticket-history/list screen. Admin-side responding to tickets.

## Conventions followed
Additive migration `0060`; own-row RLS (mirrors `user_settings`); SQL test (PT001); hand-add
`database.types.ts`; `@padel/api` mutation in the existing `settings` module; screen under
`apps/mobile/app/profile/`; `Linking`/`Share` from `react-native`; copy via `useT('profile')`.

## Open items for the implementation plan
- Confirm `Share` import availability (it's RN built-in; used in `ProfileView.tsx`).
- Confirm the settings Support-section placement (above Legal, after Account).
