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

Files: `packages/ui/src/tokens/*` (+ `tokens.test.ts`), `apps/web/src/app/tokens.generated.css` (regenerated with `node scripts/tokens.mjs --write`, never hand-edited), `apps/mobile/theme/index.ts` (if a new token group needs a mobile face), `apps/mobile/components/onboarding/{OnboardingStep,OptionList}.tsx` (+ tests), `apps/mobile/assets/onboarding/*`, the five step files (swap the import only).

- [ ] Add the spec §3 token inventory to `packages/ui`; map to existing tokens wherever close; regenerate the CSS.
- [ ] `OnboardingStep` v2 with the Figma header and progress. The progress count is derived from one ordered list exported next to `onboardingRoute()` (`ONBOARDING_STEPS`), so adding Level in PR4 updates it in one place.
- [ ] Keep spec §2 rule 8: action pinned outside the ScrollView inside the KeyboardAvoidingView; `IconButton` back with `backLabel`.
- [ ] `OptionList` (radiogroup) / `OptionCard` (radio, `checked` state). Unit test: selection, a11y state, disabled.
- [ ] Every step renders in v2 with its current content; delete `components/OnboardingStep.tsx` and `ChoiceRow`. Hand and side switch to `OptionList` here, so PR3 is visual only.
- [ ] Lower the `size:check` budget by however many literals this removes.
- [ ] `02-onboarding` still passes unchanged (selectors are labels/roles), proving the shell kept behaviour.

## PR 2 — location and Plans (Eng B) · `feat/onboarding-location-plans`

Files: `app/(onboarding)/location.tsx`, `app/(onboarding)/jammer-plus.tsx`, `components/profile/JammerPlusPaywall.tsx`, `onboarding.json` ×3, `02-onboarding.e2e.ts`.

- [ ] Frames 1–3 (spec §4.1–4.2). Keep every save/geocode branch in `location.tsx` as is; this is layout and copy.
- [ ] Frame 11 (§4.7) in `onboarding` mode only; `settings` mode unchanged (screenshot it to prove it). No purchase, no prices.
- [ ] E2E: update the location and paywall `it` blocks' selectors; add "denied permission still advances" only if the runner can deny the prompt (otherwise note it).

## PR 3 — hand, side and notifications (Eng A) · `feat/onboarding-hand-side-notifications`

Files: `app/(onboarding)/{hand,side,notifications}.tsx`, `onboarding.json` ×3, `02-onboarding.e2e.ts`.

- [ ] Frames 5–10 (§4.4–4.6). If the side frames add a third option, **stop**: that's a schema change, it moves into PR4 and goes to the founder with Level.
- [ ] Notifications keeps `stampWithRetry` / `onStampFailure` exactly; Enable and Skip both stamp.
- [ ] E2E: hand/side persist; notifications Skip stamps `notifications_prompted_at` (new `it`).

## PR 4 — Level (Eng A, then Eng B, same branch) · `feat/onboarding-level` — **blocked on founder approval**

**4a, Eng A** (hand-off comment before B starts):
- [ ] `infra/supabase/migrations/01NN_profiles_level.sql` exactly as spec §5.3: column + check, SELECT grant to anon/authenticated, UPDATE grant to authenticated, `soft_delete_account(p_user uuid)` redefined from 0143 with `level = null`, self-check block.
- [ ] DB tests: `profile-privacy-writes.test.mjs` (own write ok, other user's row refused, 0 and 6 rejected), `profile-phone-privacy.test.mjs` (authenticated can read `level`), `account-deletion-lockdown.test.mjs` (cleared on delete). `pnpm test:db` green.
- [ ] Regenerate `packages/db/src/database.types.ts`; add `level` to `useUpdateProfile`'s input in `packages/api/src/profile/mutations.ts` and to the own-profile read in `queries.ts` if Game preferences gets it (spec §9.2).
- [ ] Seeds: `infra/seed/seed-e2e.mjs` gives onboarded personas a level; `omar` stays null.

**4b, Eng B:**
- [ ] `app/(onboarding)/level.tsx` (frame 4) with `OptionList`; labels from `onboarding.json` ×3.
- [ ] Stack order in `app/(onboarding)/_layout.tsx`; `ONBOARDING_STEPS`, `OnboardingRoute`, `OnboardingProfile` and `onboardingRoute()` in `lib/postVerifyRoute.ts`; `fetchProfile`'s select in `lib/postAuthRoute.ts` and the post-verify reads in `(auth)/otp.tsx` / `password.tsx`; the route union in `app/_layout.tsx`; location's `goNext` → `level`.
- [ ] Unit: `postVerifyRoute.test.ts` / `postAuthRoute.test.ts` for the new order (spec §7).
- [ ] E2E: level persists; skipping level then relaunching resumes at level.
- [ ] If the CEO accepts spec §9.2: level in mobile Game preferences (one field).

**Hosted:** additive migration, applied by the `Supabase migrations` workflow on merge; no SQL hand-off. The build containing 4b must not be submitted before that job passes (spec §5.3). Privacy-policy line and store privacy labels go to the founder before that build ships.

## Risks

- **Figma gaps.** The plan assumes no new screens beyond the 11 frames. A multi-result location list or a court-side option adds work; both are flagged to cut rather than absorb.
- **Paywall shared with settings.** Restyling one mode can leak into the other; PR2 screenshots both.
- **E2E runner is one Mac.** PR2 and PR3 pushing together queue on it; that's time, not a blocker.
