# Onboarding redesign (post-signup steps) — spec

**Task:** PAD-16, phase 1 of PAD-15. **Goal:** launch PadelJam in January 2027.
**Design:** Figma `PJAM – Mobile App`, file `7JTILLQ5ZDxjK6CIa3aSCI`, section "Onboarding" (`10096:65247`). Renders of the 11 frames, taken 2026-11-02, are in [`assets/2026-11-02-onboarding/`](assets/2026-11-02-onboarding/). Build from those; nobody needs Figma access to build, except for the one illustration export in PR 1 (§3.3).

## 1. What changes

The post-signup onboarding in `apps/mobile/app/(onboarding)/` is redrawn to match the Figma, and gains one new step, **Level**. Nothing else moves.

| # | Render | Step | Route | Change |
|---|---|---|---|---|
| 1 | `01-location-share` | Share your location | `location` (mode `pick`) | Restyle |
| 2 | `02-location-share-prompt` | — the iOS location alert over frame 1 | — | Nothing to build (OS UI) |
| 3 | `03-location-select` | Where do you play? | `location` (mode `manual`) | Restyle; results become a list (§4.2) |
| 4 | `04-level` | What's your level? | `level` (new) | **New step and column. Built only after the founder approves collecting it (§5).** |
| 5 | `05-hand` | Select your dominant hand | `hand` | Restyle |
| 6–8 | `06-side`, `07-side`, `08-side` | Select your court side: empty, left selected, right selected | `side` | Restyle; a court diagram replaces the chips. **Still `left`/`right`, no schema change** |
| 9 | `09-notifications` | Don't miss a thing | `notifications` | Restyle |
| 10 | `10-notifications-prompt` | — the iOS notifications alert over frame 9 | — | Nothing to build (OS UI) |
| 11 | `11-plans` | Jammer+ | `jammer-plus` → `JammerPlusPaywall` | Restyle, **no purchase**, copy changes (§4.7) |

**Out of scope:** the auth screens (`(auth)/`), the web app, billing, what Jammer+ unlocks, the settings-mode paywall's layout, and the OS alerts' text. Frame 2's iOS alert reads "…to display nearby safety information", a Figma placeholder; our real text is the location usage string in the app config, and it doesn't change here.

## 2. Behaviour that must survive the redesign

These are the rules today's code encodes. A restyle that breaks one is a regression, and the E2E suite (§7) checks each.

1. **Server stamps.** `notifications_prompted_at` and `onboarded_at` are written only through `mark_notifications_prompted()` / `mark_onboarded()` (0120), via `stampWithRetry` in `apps/mobile/lib/onboardingStamps.ts`. No client timestamp.
2. **A failed stamp never locks anyone out.** First failure: stay on the step with `onboardingSaveFailed`. Second consecutive failure: continue with `onboardingSaveFailedContinue` (`onStampFailure`).
3. **Resume at the first unanswered step.** `onboardingRoute()` in `apps/mobile/lib/postVerifyRoute.ts`, shared by post-verify and Boot. New order: `location → level → hand → side → notifications → jammer-plus`.
4. **Location save failures keep the user on the step** (`locationSaveFailed`, Continue becomes Retry). Denied permission, no fix or a failed reverse geocode still advance.
5. **Manual-location Continue is gated on a finished lookup** (`!resolved || saving`), not on text length.
6. **Level / hand / side Continue is disabled until a choice is made** (frame 6 shows the disabled state); a failed `useUpdateProfile` does not block, and the step comes back on relaunch.
7. **Notifications is keyed on "was it shown"**, not on the OS result: Allow and Skip for now both stamp.
8. **The primary action stays above the keyboard** and in the accessibility tree (`OnboardingStep`'s KeyboardAvoidingView layout). Back is an `IconButton` with an accessible name.
9. **Plans has no purchase.** The trial button calls `useSetAccountPlan('jammer_plus')` as today; ✕ finishes onboarding on Free.

**One change to today's behaviour, from the design:** the level, hand and side frames have **no Skip**. Today every step has one. The Figma makes those three answers required. Location keeps Skip (frame 1) and notifications keeps "Skip for now" (frame 9). Nobody can be stuck: the three choices are taps, with no network needed before Continue, and rule 6 still advances on a failed save.

## 3. Shared components and tokens

### 3.1 Tokens
The frames use the existing palette and the existing face (Outfit). Mapped:

| Figma | Token |
|---|---|
| page background | `light.background` (slate-50) |
| titles | `light.cardForeground` (purple-900), `type.display` |
| body text | `light.mutedForeground` (slate-700) |
| primary CTA, disabled CTA | button `primary` (purple-900 / purple-100 text); disabled = the button's existing disabled opacity |
| secondary CTA ("Enter address manually", "Skip for now") | slate-100 fill, slate-800 text: button `secondary` if it matches, else a new `onboarding.secondaryAction` pair |
| Skip (frame 1) | button `tertiary` (purple-500 text) |
| back button | purple-50 square, `radius.lg` |
| progress bar | fill purple-500, track slate-200, label slate-500 `type.caption` |
| option card | unselected: slate-100 fill, slate-700 title. Selected: purple-100 fill, purple-500 2px border, purple-900 title. `radius.2xl` |
| court diagram | lines slate-300; selected half purple-100 with a purple-900 border |
| Plans backdrop | purple-900 → purple-600 gradient, white text, "Jammer+" in purple-400 |

**New tokens: one group, `onboarding` in `packages/ui/src/tokens/semantic.ts`.** It holds the option-card (selected/unselected), progress and court-diagram values above, each naming a palette entry. No new palette colours. If the secondary button tokens don't match frame 1's grey button, that pair goes in the group too. Then `node scripts/tokens.mjs --write`.

### 3.2 Components
In `apps/mobile/components/onboarding/`. They're mobile-only UI, so they don't go in `packages/`.

- **`OnboardingStep` v2.** Two header modes, from the frames:
  - `intro` (frames 1, 9): no back, optional Skip top-right, large title, body, illustration filling the middle, **two stacked actions** (primary + secondary).
  - `question` (frames 3–6): back button, **segmented progress bar with "n/N"**, title, body, content, one pinned Continue.
  - `N` and `n` come from one ordered list, `ONBOARDING_QUESTION_STEPS`, exported next to `onboardingRoute()`. It holds `location`, `hand` and `side` until Level ships (shows 1/3 … 3/3), and gains `level` in PR 4 (1/4 … 4/4, as drawn).
  - Keeps rule 8. Replaces `components/OnboardingStep.tsx`, which is deleted along with `ChoiceRow`.
- **`OptionList` / `OptionCard`.** Single-select cards, title plus optional description (level has one, hand doesn't). The selected card shows a badge illustration overlapping its top-right corner: map pin (location), target (level), hand (hand). `accessibilityRole="radio"`, `accessibilityState={{ checked }}`, and a radiogroup container.
- **`CourtSidePicker`** (frames 6–8). A perspective court split into two tappable halves labelled "Left side" / "Right side". The selected half fills, and the fox illustration jumps to it. The round swap button in the middle toggles the selection. Each half is a radio with its label as the accessible name; the swap button's accessible name is "Switch side". No animation is required beyond the fox moving.

### 3.3 Illustrations
These are raster art, exported from Figma at @2x and @3x into `apps/mobile/assets/onboarding/`:

- bunny with map (frame 1), with the cloud backdrop shared by frames 1 and 9;
- the three option badges: pin, target, hand;
- the fox on the court (frames 7–8; one image, positioned per side);
- turtle with dove (frame 9);
- astronaut fox and the space backdrop (frame 11).

PR 1 does this as one Figma render call over those layers' node IDs, which takes one founder approval. If that's refused, the founder drops the PNGs on the PR instead.

## 4. Steps

All copy lives in `packages/i18n/src/resources/{en,pt-PT,pt-BR}/onboarding.json`. The en copy below is the Figma's; pt-PT and pt-BR are written in the PR. An existing key keeps its name only if every call site wants the new copy.

### 4.1 Share your location (frame 1)
`intro` header.
- Copy: title "Share your location"; body "Share your location to discover nearby communities, groups, and events."; buttons "Allow current location" (primary) and "Enter address manually" (secondary); "Skip" top-right.
- Behaviour: rule 4, unchanged.

### 4.2 Where do you play? (frame 3)
`question` header, step 1.
- Copy: title "Where do you play?"; body "Pick your city or area. We only use it to show what's near you."; a search field with a clear (✕) button; footer "You can change this anytime in Settings."; Continue.
- Back returns to frame 1, which is where Skip lives.
- **Results are a list of `OptionCard`s**: place name, with region and country underneath; the selected one has the pin badge.
- `useGeocodeSearch` today returns one resolved place: `geocodeAsync` gives coordinates, and a reverse geocode gives the label. It changes to return **up to 3** places, with the same timeout and the same typed-text fallback. Usually that is one card, because the device geocoder rarely returns more.
- **No new places provider.** A paid autocomplete API is a board decision, and the list layout works with one result.
- Continue saves the selected card. Rules 4–5 hold, and Account Settings' use of the hook keeps working, since it uses the first result.

### 4.3 What's your level? (frame 4), new
`question` header.
- Copy: title "What's your level?"; body "Pick what fits best. You can change it later."; four `OptionCard`s with descriptions (§5.1); Continue.
- Continue writes `level` through `useUpdateProfile`; rule 6.
- Routing: inserted between location and hand in the stack, in `onboardingRoute()`, `OnboardingRoute`, `OnboardingProfile`, `ONBOARDING_QUESTION_STEPS` and `app/_layout.tsx`'s route union.
- **"You can change it later" is a promise.** Shipping that copy means level is editable in mobile Game preferences (§9.1).

### 4.4 Select your dominant hand (frame 5)
`question` header.
- Copy: title "Select your dominant hand"; body "Choose the hand you naturally play with."; cards "Left" and "Right".
- Values `left` / `right` (0003 check). Rule 6.

### 4.5 Select your court side (frames 6–8)
`question` header.
- Copy: title "Select your court side"; body "Choose the side of the court you usually play on." (the Figma has a double space, so drop it); then `CourtSidePicker`.
- Values `left` / `right`, unchanged. Frame 6 is the nothing-chosen state with Continue disabled.

### 4.6 Don't miss a thing (frame 9)
`intro` header.
- Copy: title "Don't miss a thing"; body "Turn on notifications for updates, events, and activity nearby."; buttons "Allow push notifications" (primary) and "Skip for now" (secondary).
- Behaviour: rules 1, 2 and 7, unchanged. `registerForPush()` stays the only token registration after the prompt.

### 4.7 Jammer+ (frame 11)
Restyle `JammerPlusPaywall` **in `onboarding` mode only**; `settings` mode keeps its layout and the shared data path.

From the frame, **keep:**
- the backdrop and art;
- ✕ top-right, which finishes onboarding on Free;
- title "Take your game further with **Jammer+**";
- body "Go beyond the score with deeper stats, match insights, rivalries, and exclusive perks.";
- the "Today" row, "Full Jammer+ access: deeper stats, match insights, rivalries and exclusive app icons.";
- Terms · Privacy links.

**Leave out**, because with no purchase each would be untrue, and prices are a board decision:
- the "Day 5" row: no reminder is sent;
- the "Day 7" row: "€39.00/year", "won't be charged";
- the footer "7 days free, then €39.00/year…";
- "Restore purchases".

The CTA reads "Try Jammer+" instead of "Start 7-day free trial", since nothing ends after 7 days today.

"Continue with Free" is not in the frame; ✕ replaces it. The ✕ gets the accessible name "Continue with Free", so it isn't announced as "close".

**When billing lands**, the omitted rows come back with real prices, a real trial and a real reminder. That's after launch, and it's the CEO's and founder's call.

## 5. Level: what's stored, who reads it, the migration

**Not built until the founder approves collecting it.** This section is what goes to the founder.

### 5.1 What
A player's **self-declared** playing level, as drawn in frame 4. It is not verified, not computed from results, and not used by any server rule.

- Column `profiles.level smallint null`, `check (level between 1 and 4)`.
- `null` = not answered (the resume rule keys on it).

| Value | en (Figma) | en description (Figma) | pt-PT | pt-BR |
|---|---|---|---|---|
| 1 | Getting started | I'm new to padel or have only played a few times. | A começar | Começando |
| 2 | Casual | I can keep a rally going and know the rules. | Casual | Casual |
| 3 | Intermediate | I use the walls, volley with confidence and play every week. | Intermédio | Intermediário |
| 4 | Advanced | I play competitive matches or tournaments. | Avançado | Avançado |

The pt descriptions are written in the PR. A number rather than a text enum, because the obvious next use (matching players to events and groups by level) needs ordering.

### 5.2 Who reads and writes it
Same as `dominant_hand` and `court_side`, which it sits next to:

- **Read:** any signed-in user who can already read the profile row (`profiles: read`, 0055, which excludes blocked pairs). The grant is `grant select (level) on public.profiles to anon, authenticated`, per 0115/0119. anon sees no rows; the grant keeps named-column probes answering `[]`.
- **Write:** the owner only. The grant is `grant update (level) on public.profiles to authenticated`, per 0120; the `profiles: update` policy keeps writes to your own row. Written through `useUpdateProfile`, whose input type gains `level`.
- **Not exposed elsewhere yet.** The public-profile and explore RPCs (0102, 0128, 0129) don't change. Showing level on other people's profiles is a later product decision.
- **Account deletion clears it:** `soft_delete_account(p_user uuid)` (latest body in 0143) gains `level = null`. Redefine it from the 0143 body, not an older one.

**For the founder:** this is new personal data, though not a special category.
- **Before a build that collects it ships:** it needs a line in the privacy policy and a check of the stores' privacy labels. Both are board items (gate 5).
- **The alternative, owner-only visibility,** would need a SECURITY DEFINER reader instead of a column grant. I don't recommend it: a level no one else sees can't help anyone find a game.

### 5.3 Migration
`infra/supabase/migrations/01NN_profiles_level.sql` (next free number at build time; 0148 today):

1. `alter table profiles add column level smallint check (level between 1 and 4);` It's additive, with no backfill and no lock of note.
2. The two column grants above.
3. `create or replace function public.soft_delete_account(p_user uuid)` from 0143's body, with `level = null` added. Same `search_path`; EXECUTE stays `service_role` only, as 0143 sets it. The no-argument wrapper is unchanged.
4. A self-check `do $$` block in the 0115/0119/0120 style:
   - authenticated has SELECT and UPDATE on `level`;
   - anon has SELECT only;
   - `phone`/`email` are still unreadable;
   - the 0120 writable set is now the nine columns plus `level`.

**Deploy order.** The migration is additive, so old builds are safe whether or not it has run. The **new build must not ship before the migration is applied**: `fetchProfile` selects `level`, and on a database without the column every launch fails routing. The `Supabase migrations` workflow applies it on merge, before any EAS build.

**Tests:**
- `infra/supabase/tests/profile-privacy-writes.test.mjs`: the owner can write `level`, another user can't, and 0 and 5 are rejected;
- `profile-phone-privacy.test.mjs`: the column read;
- `account-deletion-lockdown.test.mjs`: level cleared.

`packages/db` types regenerated.

## 6. Locales
Every new or changed string exists in en, pt-PT and pt-BR, and `pnpm i18n:check` passes. pt-PT and pt-BR are written separately, not copied. For example: "ecrã"/"tela", "telemóvel"/"celular", "A começar"/"Começando".

## 7. Tests

- **Unit:**
  - `postVerifyRoute.test.ts` and `postAuthRoute.test.ts` cover the new order: level unanswered → `level`; level answered and hand not → `hand`; onboarded → tabs regardless of level.
  - `OptionList` covers selection and a11y state; `CourtSidePicker` covers tap-to-select and swap.
  - `useGeocodeSearch` covers several results, one result, and the typed-text fallback.
- **E2E `apps/mobile/e2e/suites/02-onboarding.e2e.ts`:** selectors are updated for the redesign and use labels and roles, not layout. It also checks:
  - location Skip leaves `location_text` null, and relaunch resumes there;
  - level persists (after approval);
  - hand and side persist;
  - notifications "Skip for now" stamps `notifications_prompted_at`;
  - ✕ on Jammer+ stamps `onboarded_at` and lands on Home.
- **DB:** §5.3.

## 8. Acceptance criteria

1. Each built frame matches its render on an iPhone 15-size simulator and a small Android, in en and pt-BR. Each PR includes screenshots next to the render.
2. Every rule in §2 holds; `02-onboarding` passes on the founder's runner.
3. No raw colour or new literal size in `apps/mobile`; new values are tokens in `packages/ui`.
4. All strings exist in three locales.
5. VoiceOver reads each step in order: back, progress ("step 2 of 4"), title, body, options with their selected state, primary action.
6. Jammer+ shows no price, no trial length and no charge or reminder claim.
7. Level: column, grants and deletion as in §5, with DB tests proving read, write and deletion. Not merged before the founder's approval.
8. No change outside these paths:
   - `apps/mobile/app/(onboarding)/` and `apps/mobile/components/onboarding/`;
   - `JammerPlusPaywall`, `apps/mobile/lib/{postVerifyRoute,postAuthRoute,useGeocodeSearch}.ts` and `apps/mobile/assets/onboarding/`;
   - `packages/ui` tokens and `packages/i18n` onboarding strings;
   - `packages/api` (`useUpdateProfile` input) and `packages/db` types;
   - the migration and its tests;
   - Game preferences, only if §9.1 is accepted.

## 9. Open questions (CEO)

1. **Editing level after onboarding.** Frame 4 says "You can change it later", but under the stated scope it can't be changed. **Recommend** adding one level field to mobile Game preferences in PR 4. Otherwise the copy loses that sentence. Web follows later either way.
2. **No Skip on level, hand and side** (§2). This follows the design; confirm it's intended.
3. **Jammer+ copy without billing** (§4.7). The trial rows, price and "Restore purchases" are left out until billing lands; confirm.
