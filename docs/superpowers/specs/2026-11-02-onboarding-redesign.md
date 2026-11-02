# Onboarding redesign (post-signup steps) — spec

**Task:** PAD-16, phase 1 of PAD-15. **Goal:** launch PadelJam in January 2027.
**Design:** Figma `PJAM – Mobile App`, file `7JTILLQ5ZDxjK6CIa3aSCI`, section "Onboarding" (`10096:65247`).
**Status:** draft. Sections marked **[Figma]** are filled from the frames before this is approved; everything else is final.

## 1. What changes

The post-signup onboarding in `apps/mobile/app/(onboarding)/` is redrawn to match the Figma, and gains one new step, **Level**. Nothing else moves.

| # | Step | Frames | Route | Today | Change |
|---|---|---|---|---|---|
| 1–2 | Share your location | `10096:65852`, `10101:66212` | `location` (mode `pick`) | `location.tsx` | Restyle |
| 3 | Select location | `10868:20584` | `location` (mode `manual`) | `location.tsx` | Restyle |
| 4 | Select level | `10832:5935` | `level` (new) | — | **New step and column. Built only after the founder approves collecting it (§5).** |
| 5 | Dominant hand | `10832:6077` | `hand` | `hand.tsx` | Restyle |
| 6–8 | Court side | `10072:15532`, `10832:6213`, `10832:6937` | `side` | `side.tsx` | Restyle |
| 9–10 | Push notifications | `10072:13676`, `10105:66668` | `notifications` | `notifications.tsx` | Restyle |
| 11 | Plans | `10832:1042` | `jammer-plus` | `jammer-plus.tsx` → `JammerPlusPaywall` | Restyle, **no purchase** |

**Out of scope:** the auth screens (`(auth)/`), the web app, billing, any change to what Jammer+ unlocks, and the settings-mode paywall's layout (§4.6).

## 2. Behaviour that must survive the redesign

These are the rules today's code encodes. A restyle that breaks one is a regression, and the E2E suite (§7) checks each.

1. **Server stamps.** `notifications_prompted_at` and `onboarded_at` are written only through `mark_notifications_prompted()` / `mark_onboarded()` (0120), via `stampWithRetry` in `apps/mobile/lib/onboardingStamps.ts`. No client timestamp.
2. **A failed stamp never locks anyone out.** First failure: stay on the step with `onboardingSaveFailed`. Second consecutive failure: continue with `onboardingSaveFailedContinue` (`onStampFailure`).
3. **Resume at the first unanswered step.** `onboardingRoute()` in `apps/mobile/lib/postVerifyRoute.ts`, shared by post-verify and Boot. New order: `location → level → hand → side → notifications → jammer-plus`. A skipped step stays unanswered and is offered again on relaunch, as today.
4. **Location save failures keep the user on the step** (`locationSaveFailed`, Continue becomes Retry). Denied permission, no fix or a failed reverse geocode still advance.
5. **Manual-location Continue is gated on a finished lookup** (`!resolved || saving`), not on text length.
6. **Hand / side / level Continue is disabled until a choice is made**; a failed `useUpdateProfile` does not block (the step comes back on relaunch).
7. **Notifications is keyed on "was it shown"**, not on the OS result: Enable and Skip both stamp.
8. **The primary action stays above the keyboard** and in the accessibility tree (`OnboardingStep`'s KeyboardAvoidingView layout). Back is an `IconButton` with an accessible name.
9. **Plans has no purchase.** "Start trial" calls `useSetAccountPlan('jammer_plus')` as today; ✕ and "Continue with Free" finish onboarding.

## 3. Shared components and tokens

All new visual values are tokens in `packages/ui/src/tokens/` (consumed by `apps/mobile/theme`), never literals in a screen: `pnpm tokens:check` and the mobile lint rule reject raw colours, and `size:check` budgets literal sizes (lower it if the PR removes literals; it fails when under budget).

Components, in `apps/mobile/components/onboarding/` (mobile-only UI; nothing here is shared with web, so it does not belong in `packages/`):

- **`OnboardingStep` v2** — the step shell: header (back, **[Figma]** progress indicator, skip), illustration slot, title, body, content, pinned primary/secondary actions. Keeps rule 8. Replaces `components/OnboardingStep.tsx`; the old file is deleted once every step uses v2.
- **`OptionCard` / `OptionList`** — single-select cards replacing `ChoiceRow`, used by level, hand and side. `accessibilityRole="radio"`, `accessibilityState={{ checked }}`, and a radiogroup container. **[Figma]** icon/illustration per option, selected and pressed states.
- **Illustrations** — **[Figma]** list the exported assets (format, @2x/@3x) per step; they go in `apps/mobile/assets/onboarding/`.

**[Figma] Token inventory** — every colour, radius, spacing and type style the frames use that `packages/ui` lacks, each mapped to an existing token where one is close enough. A new token needs a reason.

## 4. Steps

Each step lists the copy keys it needs; all copy lives in `packages/i18n/src/resources/{en,pt-PT,pt-BR}/onboarding.json`. Existing keys are reused where the meaning is unchanged; a key whose copy changes keeps its name only if every call site wants the new copy.

### 4.1 Share your location (frames 1–2)
`pick` mode. Frame 1 is the step; frame 2 is **[Figma]** (expected: the OS permission prompt over it — then nothing to build but the pre-prompt copy). Actions: use current location, add manually, skip. Behaviour: rules 4.

### 4.2 Select location (frame 3)
`manual` mode. Text field, geocode result, Continue/Retry, skip. Behaviour: rules 4–5. **[Figma]** whether results show as a list (today: one resolved label). If the Figma shows a multi-result list, `useGeocodeSearch` is unchanged and the list is a follow-up — say so in the PR rather than growing the geocoder.

### 4.3 Select level (frame 4) — new
Single-select `OptionList` of the levels in §5, Continue writes `level` through `useUpdateProfile`, rule 6. Inserted between location and hand in the stack, in `onboardingRoute()`, in the `OnboardingRoute` type and in `app/_layout.tsx`'s route union.

### 4.4 Dominant hand (frame 5)
Options `left` / `right` (column check, 0003). Rule 6.

### 4.5 Court side (frames 6–8)
Options `left` / `right` today. **[Figma]** frames 7–8 are either selection states (no data change) or add an option such as "both / no preference". **If they add an option, that is a schema change** (`court_side` check, plus web's game settings and profile pages, which read it) and it moves into the Level PR, behind the same founder review.

### 4.6 Push notifications (frames 9–10)
Frame 9 is the pre-prompt, frame 10 **[Figma]** (expected: the OS alert). Behaviour: rules 1, 2, 7. `registerForPush()` stays the only token registration after the prompt.

### 4.7 Plans (frame 11)
Restyle `JammerPlusPaywall` **in `onboarding` mode only**. `settings` mode (Profile → Jammer+) keeps its current layout unless the Figma section covers it; the component keeps one data path for both. No store purchase, no price shown that implies one: prices are a board decision (rule 6 of the board list). **[Figma]** if the frame shows prices, the PR shows the plan names and benefits and leaves the price slots out, and the gap goes to the CEO.

## 5. Level: what's stored, who reads it, the migration

**Not built until the founder approves collecting it.** This section is what goes to the founder.

### 5.1 What
A player's **self-declared** playing level. Not verified, not computed from results, not used by any server rule.

- Column `profiles.level smallint null`, `check (level between 1 and 5)`.
- `null` = not answered (the resume rule keys on it).
- Values (labels in all three locales, final copy from the Figma):

| Value | en | pt-PT | pt-BR |
|---|---|---|---|
| 1 | Beginner | Iniciante | Iniciante |
| 2 | Improver | Iniciado | Intermediário iniciante |
| 3 | Intermediate | Intermédio | Intermediário |
| 4 | Advanced | Avançado | Avançado |
| 5 | Competitive | Competição | Competição |

**[Figma]** the band count and labels follow frame `10832:5935`; if it shows N bands, the check is `between 1 and N`. A number rather than a text enum because the obvious next use (matching players to events and groups by level) needs ordering, and the labels differ between Portugal and Brazil anyway.

### 5.2 Who reads and writes it
Same as `dominant_hand` and `court_side`, which it sits next to:

- **Read:** any signed-in user who can already read the profile row (`profiles: read`, 0055, which excludes blocked pairs). `grant select (level) on public.profiles to anon, authenticated` per 0115/0119 (anon sees no rows; the grant keeps named-column probes answering `[]`).
- **Write:** the owner only. `grant update (level) on public.profiles to authenticated` per 0120; `profiles: update` keeps it to your own row. Written through `useUpdateProfile` (its input type gains `level`).
- **Not exposed elsewhere yet.** The public-profile and explore RPCs (0102, 0128, 0129) are not changed; showing level on other people's profiles is a later product decision.
- **Account deletion clears it:** `soft_delete_account(p_user uuid)` (latest body in 0143) gains `level = null`. Redefine from the 0143 body, not an older one.

**For the founder:** this is new personal data (not a special category). It needs a line in the privacy policy and a check of the stores' privacy labels before a build that collects it ships — both board items (gate 5). The alternative, owner-only visibility, would need a SECURITY DEFINER reader instead of a column grant; it is not recommended, since a level no one else sees can't help anyone find a game.

### 5.3 Migration
`infra/supabase/migrations/01NN_profiles_level.sql` (next free number at build time; 0146 today):

1. `alter table profiles add column level smallint check (level between 1 and 5);` — additive, no backfill, no lock of note.
2. The two column grants above.
3. `create or replace function public.soft_delete_account(p_user uuid)` from 0143's body with `level = null` added (same `search_path`; EXECUTE stays `service_role` only, as 0143 sets it). The no-argument wrapper is unchanged.
4. A self-check `do $$` block in the 0115/0119/0120 style: authenticated has SELECT and UPDATE on `level`, anon has SELECT only, `phone`/`email` still unreadable, the 0120 writable set is now the nine columns plus `level`.

Additive, so it is safe in either order against old builds. The **new build must not ship before the migration is applied**: `fetchProfile` selects `level`, and on a database without it every launch fails routing. The `Supabase migrations` workflow applies it on merge, before any EAS build.

Tests: `infra/supabase/tests/profile-privacy-writes.test.mjs` (owner can write `level`, another user can't, out-of-range rejected), `profile-phone-privacy.test.mjs` (column read), and `account-deletion-lockdown.test.mjs` (level cleared). `packages/db` types regenerated.

## 6. Locales
Every new or changed string in en, pt-PT and pt-BR; `pnpm i18n:check` passes. pt-PT and pt-BR are written separately (e.g. "ecrã"/"tela", "telemóvel"/"celular"), not copied.

## 7. Tests

- **Unit:** `postVerifyRoute.test.ts` and `postAuthRoute.test.ts` cover the new order (level unanswered → `level`; level answered, hand not → `hand`; onboarded → tabs regardless of level).
- **E2E `apps/mobile/e2e/suites/02-onboarding.e2e.ts`:** updated selectors for the redesign, plus: level selection persists (after approval), skip leaves the column null and relaunch resumes there, notifications stamp on Skip, "Continue with Free" stamps `onboarded_at` and lands on Home. Selectors use labels and roles, not layout.
- **DB:** §5.3.

## 8. Acceptance criteria

1. Each of the 11 frames is matched on an iPhone 15-size simulator and a small Android, in en and pt-BR; screenshots in each PR.
2. Every rule in §2 holds; `02-onboarding` passes on the founder's runner.
3. No raw colour or new literal size in `apps/mobile`; new values are tokens in `packages/ui`.
4. All strings in three locales.
5. VoiceOver reads each step in order: back, progress, title, options with selected state, primary action.
6. Level: column, grants and deletion as §5, DB tests prove read/write/deletion; not merged before the founder's approval.
7. No change outside `apps/mobile/app/(onboarding)/`, its components, `apps/mobile/lib/postVerifyRoute.ts` + `postAuthRoute.ts`, `packages/ui` tokens, `packages/i18n` onboarding strings, `packages/api` (`useUpdateProfile` input), `packages/db` types, the migration and its tests.

## 9. Open questions

1. **[Figma]** items above (being read now).
2. **Editing level after onboarding.** Hand and side are editable in mobile Game preferences and web game settings. Level isn't, under this scope, so a wrong answer can't be fixed. Recommend adding it to mobile Game preferences in the Level PR (one field); web follows later. CEO to decide.
3. Court side third option, if the Figma has one (§4.5).
