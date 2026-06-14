# Phase 1B-2a — Settings Hub + Log Out + Language + Legal — Design

*Padel Jam • 2026-06-14 • Brainstormed design / spec*

## Goal

Stand up the Settings surface: a settings screen reached from a gear on the own-profile, with
Language selection (live + persisted), Legal links (Terms/Privacy), and Log out. First slice of
the settings portion of `Requirements/profile.md` (PR-10/PR-13 partial).

**Decomposition:** Phase 1B-2 (settings) = **1B-2a (this: hub shell + logout + language + legal)**,
1B-2b (notifications / `user_settings`), 1B-2c (account security: password, email/phone OTP,
delete account), 1B-2d (app-icon picker, support tickets). 1B-2a first.

Branch `feat/phase1b2-settings` (stacked on `feat/phase1b-profile-edit`, which has 1B-1).
**No migration** — language writes the existing `profiles.locale`; no new tables.

## Scope decisions (made with the user)

1. **1B-2a first**: hub shell + log out + language + legal. Defer notifications, password,
   email/phone OTP, delete account, app-icon, support tickets.
2. **Include the boot change** so the chosen language persists across restarts (resolves the
   existing `_layout.tsx` TODO to prefer `profiles.locale`).
3. **Legal URLs are placeholder constants** (`https://padeljam.app/terms`, `…/privacy`), updatable later.

## Architecture

```
own ProfileView (isSelf) ── gear icon ──> /profile/settings
  /profile/settings
    Preferences › Language  -> selector -> i18n.changeLanguage(locale)
                                          + useUpdateProfile({ locale })  (persists profiles.locale)
    Legal › Terms / Privacy -> Linking.openURL(TERMS_URL | PRIVACY_URL)
    Log out                 -> signOut(supabase) -> router.replace('/(auth)/sign-in')

app boot (_layout): i18n init now prefers profiles.locale (session present) -> device locale fallback
```

## Components

- **`apps/mobile/components/profile/ProfileView.tsx`** — when `isSelf`, add a **gear** button (SF Symbol `gearshape`) in the header → `router.push('/profile/settings')` (alongside the existing Edit button).
- **`apps/mobile/app/profile/settings.tsx`** (new, under the existing profile Stack) — a `ScrollView` of sections:
  - **Preferences**: a **Language** row showing the current language label; tapping toggles an inline list of the three options (English / Português (Portugal) / Português (Brasil)). Selecting an option: `i18n.changeLanguage(locale)` then `update.mutate({ locale })`, and reflects the new active language immediately.
  - **Legal**: **Terms of Service** and **Privacy Policy** rows → `Linking.openURL(...)`.
  - **Log out**: a destructive-styled button → `await signOut(supabase); router.replace('/(auth)/sign-in')`.
- **Legal URL constants** — `TERMS_URL = 'https://padeljam.app/terms'`, `PRIVACY_URL = 'https://padeljam.app/privacy'`, defined at the top of `settings.tsx` (a dedicated module is overkill for two constants).
- **Language source of truth:** the three supported `locale` values are `'en' | 'pt-PT' | 'pt-BR'` (the `profiles.locale` CHECK + i18n bundles). The selector maps these to display labels.

## Data / API

- **`useUpdateProfile`** (`packages/api/src/profile/mutations.ts`): add `locale?: string` to `UpdateProfileInput`. The settings screen calls `update.mutate({ locale })`. `profiles.locale` already exists; the RLS update policy (`id = auth.uid()` + WITH CHECK from 1B-1) covers it. No new hook.

## Boot change (`apps/mobile/app/_layout.tsx`)

Replace the device-only i18n-init effect with one that prefers the signed-in user's
`profiles.locale`:
- `await supabase.auth.getSession()`; if a user exists, `select('locale').eq('id', user.id).single()`.
- Use that locale (via `resolveLocale`) if present; otherwise fall back to the device locale.
- Keep the existing failure fallback (bare `'en'` instance). The splash stays up until i18n is ready
  (one extra `getSession` + one `select` — acceptable at boot).

`supabase` is already imported in `_layout.tsx` (the Boot component uses it).

## i18n

Add to the `profile` namespace (English-only, like the rest of `profile`):
`settings`, `preferences`, `language`, `languageEnglish`, `languagePtPt`, `languagePtBr`,
`legal`, `terms`, `privacy`, `logout`.

## Testing

- **No SQL** (no schema change).
- **Type/typecheck**: `locale?` added to `UpdateProfileInput`; `pnpm -w typecheck`.
- **Unit**: existing `@padel/api` tests stay green (no new hook surface to test beyond types).
- **Manual smoke** (JS): gear on own profile → settings; switch language → UI strings update live and
  the choice persists after a relaunch (boot reads `profiles.locale`); Terms/Privacy open in the
  browser; Log out returns to the sign-in screen and the tabs are no longer reachable.

## Explicitly deferred (NOT 1B-2a)
- Notification toggles + `user_settings` (1B-2b); password change, email/phone OTP re-verify,
  delete account (1B-2c); app-icon picker, support tickets, Help/Rate/Share (1B-2d).
- Account/Subscription rows on the hub (1C). Per-section deep links beyond Language/Legal.

## Conventions followed
No migration; reuse `signOut` (`@padel/auth`), `useUpdateProfile` (`@padel/api`), `resolveLocale`
(`@/lib/locale`), `useT`/`i18n.changeLanguage` (react-i18next via `@padel/i18n`); copy via
`useT('profile')`; screen under the existing `apps/mobile/app/profile/` Stack.

## Open items for the implementation plan
- Confirm `signOut` is exported from `@padel/auth` index (it's in `packages/auth/src/session.ts`).
- Confirm `resolveLocale` accepts an arbitrary string and maps to a supported locale (it does — `lib/locale.ts`).
- Decide the language-selector UX: inline expanding list vs a small modal. Recommended: inline
  expanding list (simplest; no extra modal component).
