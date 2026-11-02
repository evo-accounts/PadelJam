# Onboarding redesign — build plan

**Spec:** `docs/superpowers/specs/2026-11-02-onboarding-redesign.md`. **Task:** PAD-16 (phase 1 of PAD-15). **Goal:** launch in January 2027.

Four PRs, each its own branch off `main` unless noted. Every PR runs the full hand-off checks (`pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions`, plus `pnpm test:db` for PR 4), attaches simulator screenshots of its frames in en and pt-BR, and goes QA → CTO review → merge.

## Load

| Engineer | PRs | Count |
|---|---|---|
| Eng B (mobile) | 1, 2, 4b | 3 |
| Eng A (backend, web, and mobile this phase) | 3, 4a | 2 |

Nobody is over three. Rebalanced from the proposal in one way: the Level PR is split A-then-B on one branch (backend first, per the CTO rule), so Eng A owns the migration and Eng B the screen.

## Order

```
PR1 (B) shell + tokens ──┬── PR2 (B) location + plans ──┐
                         └── PR3 (A) hand, side, notif ─┴── PR4 (A→B) level   ← after founder approval
```

PR2 and PR3 run in parallel after PR1 merges. They touch different step files; both touch `onboarding.json` (three locales) and `02-onboarding.e2e.ts`, so **whichever merges second rebases** and keeps the other's keys and `it` blocks. PR4 starts only when the founder's approval is recorded on PAD-15; it can start before PR2/PR3 merge (it adds a file and a route).

## PR 1 — shared components and tokens (Eng B) · `feat/onboarding-shell`

Files: `packages/ui/src/tokens/semantic.ts` (+ `tokens.test.ts`), `apps/web/src/app/tokens.generated.css` (regenerated with `node scripts/tokens.mjs --write`, never hand-edited), `apps/mobile/theme/index.ts` (mobile face for the new group), `apps/mobile/components/onboarding/{OnboardingStep,OptionList}.tsx` (+ tests), `apps/mobile/assets/onboarding/*`, `apps/mobile/lib/postVerifyRoute.ts` (`ONBOARDING_QUESTION_STEPS` only), the five step files (swap the import only).

- [ ] The `onboarding` token group from spec §3.1. No new palette colours; regenerate the CSS.
- [ ] Illustrations (spec §3.3): one Figma render call (scale 3, then downscale to @2x) for the art layers, after a one-level node read of frames 1, 4, 5, 7, 9 and 11 finds their IDs. Two founder approvals; if refused, ask for PNGs on the PR. Compress them (`size:check` doesn't cover assets; keep the set under ~1.5 MB).
- [ ] `OnboardingStep` v2 with both header modes (`intro`, `question`). The progress count is derived from `ONBOARDING_QUESTION_STEPS` (location, hand, side for now), so PR 4 adds Level in one place.
- [ ] Keep spec §2 rule 8: the action pinned outside the ScrollView, inside the KeyboardAvoidingView; an `IconButton` back with `backLabel`.
- [ ] `OptionList` (radiogroup) / `OptionCard` (radio, `checked` state, optional description, optional badge). Unit test: selection, a11y state, disabled.
- [ ] Every step renders in v2 with its current content. Delete `components/OnboardingStep.tsx` and `ChoiceRow`; hand switches to `OptionList` here.
- [ ] Lower the `size:check` budget by however many literals this removes.
- [ ] `02-onboarding` still passes unchanged (selectors are labels/roles), proving the shell kept behaviour.

## PR 2 — location and Plans (Eng B) · `feat/onboarding-location-plans`

Files: `app/(onboarding)/location.tsx`, `app/(onboarding)/jammer-plus.tsx`, `components/profile/JammerPlusPaywall.tsx`, `onboarding.json` ×3, `02-onboarding.e2e.ts`.

Files also include `apps/mobile/lib/useGeocodeSearch.ts` (+ test) and its Account Settings caller.

- [ ] Frames 1 and 3 (spec §4.1–4.2). Keep every save branch in `location.tsx`. `useGeocodeSearch` returns up to 3 places (same timeout, same fallback); Account Settings takes the first, unchanged. No new places provider.
- [ ] Frame 11 (§4.7) in `onboarding` mode only, with the listed rows and price lines left out, "Try Jammer+" as the CTA, and ✕ named "Continue with Free". `settings` mode is unchanged (screenshot it to prove it). No purchase.
- [ ] E2E: update the location and paywall `it` blocks (the paywall exit is now ✕ by its accessible name); add "location Skip leaves it null and relaunch resumes there".

## PR 3 — hand, side and notifications (Eng A) · `feat/onboarding-hand-side-notifications`

Files: `app/(onboarding)/{hand,side,notifications}.tsx`, `onboarding.json` ×3, `02-onboarding.e2e.ts`.

Files also include `apps/mobile/components/onboarding/CourtSidePicker.tsx` (+ test).

- [ ] Frames 5, 6–8 and 9 (§4.4–4.6). Hand: copy only (PR 1 moved it to `OptionList`). Side: `CourtSidePicker` (two radio halves, swap button, fox moves), values still `left`/`right`. Level, hand and side lose Skip (spec §2).
- [ ] Notifications keeps `stampWithRetry` / `onStampFailure` exactly; Allow and Skip for now both stamp.
- [ ] E2E: hand and side persist (side taps "Left side"/"Right side"); "Skip for now" stamps `notifications_prompted_at` (new `it`).

## PR 4 — Level (Eng A, then Eng B, same branch) · `feat/onboarding-level` — **blocked on founder approval**

**4a, Eng A** (hand-off comment before B starts):
- [ ] `infra/supabase/migrations/01NN_profiles_level.sql` exactly as spec §5.3: column + check (1–4), SELECT grant to anon/authenticated, UPDATE grant to authenticated, `soft_delete_account(p_user uuid)` redefined from 0143 with `level = null`, self-check block.
- [ ] DB tests: `profile-privacy-writes.test.mjs` (own write ok, other user's row refused, 0 and 5 rejected), `profile-phone-privacy.test.mjs` (authenticated can read `level`), `account-deletion-lockdown.test.mjs` (cleared on delete). `pnpm test:db` green.
- [ ] Regenerate `packages/db/src/database.types.ts`; add `level` to `useUpdateProfile`'s input in `packages/api/src/profile/mutations.ts` and to the own-profile read in `queries.ts` if Game preferences gets it (spec §9.1).
- [ ] Seeds: `infra/seed/seed-e2e.mjs` gives onboarded personas a level; `omar` stays null.

**4b, Eng B:**
- [ ] `app/(onboarding)/level.tsx` (frame 4) with `OptionList`; four bands (spec §5.1), labels and descriptions from `onboarding.json` ×3.
- [ ] Stack order in `app/(onboarding)/_layout.tsx`; `ONBOARDING_QUESTION_STEPS`, `OnboardingRoute`, `OnboardingProfile` and `onboardingRoute()` in `lib/postVerifyRoute.ts`; `fetchProfile`'s select in `lib/postAuthRoute.ts` and the post-verify reads in `(auth)/otp.tsx` / `password.tsx`; the route union in `app/_layout.tsx`; location's `goNext` → `level`.
- [ ] Unit: `postVerifyRoute.test.ts` / `postAuthRoute.test.ts` for the new order (spec §7).
- [ ] E2E: level persists; skipping level then relaunching resumes at level.
- [ ] If the CEO accepts spec §9.1: level in mobile Game preferences (one field). If not, drop "You can change it later" from the level copy.

**Hosted:** additive migration, applied by the `Supabase migrations` workflow on merge; no SQL hand-off. The build containing 4b must not be submitted before that job passes (spec §5.3). Privacy-policy line and store privacy labels go to the founder before that build ships.

## Risks

- **Figma access.** Each Composio call needs a founder approval, and large results come back truncated. The renders in `docs/superpowers/specs/assets/2026-11-02-onboarding/` are the build reference; only PR 1's illustration export touches Figma.
- **Geocoder list.** The device geocoder usually returns one place, so the list is often a single card. That's accepted; a richer list means a paid places API (a board decision), not in this plan.
- **Paywall shared with settings.** Restyling one mode can leak into the other; PR2 screenshots both.
- **E2E runner is one Mac.** PR2 and PR3 pushing together queue on it; that's time, not a blocker.
