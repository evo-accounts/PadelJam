# New accounts keep the language they signed up in (PAD-325)

**Goal link:** launch PadelJam in Portugal and Brazil, January 2027, in pt-PT, pt-BR and en (checklist L1).
**Status:** proposed. Found by reading code; nothing here was run on a device or browser.

## Finding

`profiles.locale` is `not null default 'pt-PT'` (`0003_profiles.sql:7`). The `complete-account` edge function creates the profile (`infra/supabase/functions/complete-account/index.ts:108`, row built in `_shared/profileRow.ts`) and never sets a locale; neither web (`useAuthFlow.ts:219`) nor mobile sends one. So **every new account is pt-PT**, whatever language the sign-up screens showed.

Both clients then prefer the profile's locale over the device or browser (`apps/web/src/components/Providers.tsx:36`, `apps/mobile/app/_layout.tsx:69`), read once at boot. The result on **web and mobile alike**: a Brazilian (or English) user signs up in their language and sees pt-PT from the next page load or app launch. A fresh install on a pt-BR phone would show pt-PT from the second launch.

Can the user change it? Yes, Settings → App preferences → language on both (web `settings/app-preferences`, mobile `profile/app-preferences.tsx`), persisted to `profiles.locale`. Few people will look for it after the app has switched language on them.

`/help` (`apps/web/src/app/(public)/help/page.tsx`) is a hard-coded English page, outside the i18n catalog. It is the Support link target, so pt-PT and pt-BR users land on English.

## Launch decision

- **New-account language: Must.** L1 says every area works in pt-PT, pt-BR and en, and half the launch market is Brazil. The fix is small (one optional field, one default) and the failure hits every new Brazilian and English user on their first return visit. Cutting it isn't a saving.
- **Existing accounts:** no backfill. Pre-launch accounts are test data; their locale is whatever they chose or the default. Say if the founder wants otherwise.
- **`/help` in three locales: Should**, taken in the same PR since it is the same theme and tiny. If it threatens the date, ship English with a pt-PT/pt-BR/en switch deferred, but store reviewers in Brazil opening the support URL see English, so I'd keep it.

## Scope

1. **Client sends the locale.** `complete-account` accepts an optional `locale`. Web sends `i18n.language` (resolved by `resolveLocale`); mobile sends the active i18n language. This is the language the user was reading when they created the account.
2. **Server validates.** Accept only `pt-PT`, `pt-BR`, `en` (the same list as the `profiles.locale` check). Anything else or missing: fall back to `pt-PT`, never a 400, so older app builds keep working. `buildProfileRow` takes `locale` and has a unit test for each case.
3. **Re-run safe.** The function upserts on retry. A second call must not overwrite a locale the user has since changed in App preferences: write `locale` on insert only, or keep it out of the update set.
4. **Browser/device fallback for the signed-in session** stays as is (it still applies when the profile has no row yet, e.g. during onboarding before completion).
5. **`/help` localised.** Move the copy into the web catalog in all three locales (`i18n:check` must scan it; see T-I18N in the checklist). Choose the language the way other public pages (`privacy`, `terms`) do; if they are English-only too, say so on the plan and handle them under the same rule rather than silently differing.

Out of scope: a language picker on the sign-up screens, backfilling existing rows, email templates (checklist item 3 covers them).

## Acceptance criteria

1. Create an account on web with a browser in pt-BR: `profiles.locale = 'pt-BR'`; reload `/onboarding` and settings: still pt-BR. Same for `en`, and for a pt-PT browser.
2. Same on mobile with a device in pt-BR and in en (founder device pass; not checkable by agents).
3. `complete-account` with `locale: 'fr'`, with `locale` absent, and with a non-string value: 200, `pt-PT`. With each valid value: stored as sent. Edge-function test covers all of these.
4. Call `complete-account` twice, the user having switched to `en` in between: locale stays `en`.
5. Changing language in App preferences still persists and survives reload (existing behaviour, no regression).
6. `/help` renders in each of pt-PT, pt-BR and en with no raw keys; `pnpm i18n:check` fails when a `/help` key is missing in one locale.
7. Standard checks pass, plus `pnpm test:db` if anything under `infra/` besides the function changes (it shouldn't: no migration needed).

## Privacy

No new personal data: `locale` is already stored and already in the privacy policy's profile fields. No gate 5 item.

## Open UX questions

- Should the language also be asked explicitly during onboarding? Not for launch; revisit after first Brazil feedback.
