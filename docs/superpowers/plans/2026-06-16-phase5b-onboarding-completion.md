# Phase 5B — Onboarding Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the hand/court-side onboarding steps and resume a not-onboarded user at the first unanswered step (AU-21).

**Architecture:** `hand.tsx`/`side.tsx` write the selected value via `useUpdateProfile` on Continue (Skip leaves it null); `Boot()` reads the onboarding fields and routes to the first unanswered step. No migration — columns + hook already exist.

**Tech Stack:** Expo Router, React Native, `@padel/api` (`useUpdateProfile`), Supabase.

**Spec:** `docs/superpowers/specs/2026-06-16-phase5b-onboarding-completion-design.md`

**Verification posture:** `pnpm -w typecheck` (client-only; no SQL/migration). Simulator smoke is the behavioral check (deferred).

**Verified context:**
- `OnboardingStep` props: `onPrimary`, `onSkip`, `primaryLabel`, `primaryDisabled?`. `ChoiceRow` `value`/`onChange`/`options`.
- `hand.tsx`/`side.tsx` currently call the same `next()` for both Continue and Skip; values map to `profiles.dominant_hand` / `profiles.court_side` ('left'/'right').
- `useUpdateProfile()` (`@padel/api`) → `db.from('profiles').update(input)`, supports `dominant_hand`/`court_side`.
- `Boot()` in `apps/mobile/app/_layout.tsx`: `type Target = '(tabs)' | '(onboarding)' | 'welcome' | 'sign-in'`; `resolve()` selects `onboarded_at` only, returns `'(onboarding)'` when not onboarded; the routing block maps `'(onboarding)'` → `router.replace('/(onboarding)/location')`.

---

## File Structure
- **Modify** `apps/mobile/app/(onboarding)/hand.tsx` — persist `dominant_hand` on Continue.
- **Modify** `apps/mobile/app/(onboarding)/side.tsx` — persist `court_side` on Continue.
- **Modify** `apps/mobile/app/_layout.tsx` — `Boot()` resume-at-first-unanswered.

---

## Task 1: persist hand + court-side on Continue

**Files:**
- Modify: `apps/mobile/app/(onboarding)/hand.tsx`
- Modify: `apps/mobile/app/(onboarding)/side.tsx`

- [ ] **Step 1: Persist in hand.tsx**

Replace `apps/mobile/app/(onboarding)/hand.tsx` with:

```tsx
import { useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ChoiceRow, OnboardingStep } from '@/components/OnboardingStep';

export default function HandStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const update = useUpdateProfile();
  const [hand, setHand] = useState<string | null>(null);

  const goNext = () => router.push('/(onboarding)/side');

  // Continue: persist the choice (if any) then advance. Skip: advance without persisting.
  const onContinue = async () => {
    if (update.isPending) return;
    if (hand) {
      try {
        await update.mutateAsync({ dominant_hand: hand });
      } catch {
        /* re-promptable on relaunch; don't hard-block onboarding */
      }
    }
    goNext();
  };

  return (
    <OnboardingStep
      title={t('handTitle')}
      body={t('handBody')}
      primaryLabel={t('continue')}
      primaryDisabled={update.isPending}
      onPrimary={onContinue}
      onSkip={goNext}
    >
      <ChoiceRow
        value={hand}
        onChange={setHand}
        options={[
          { key: 'left', label: t('handLeft') },
          { key: 'right', label: t('handRight') },
        ]}
      />
    </OnboardingStep>
  );
}
```

- [ ] **Step 2: Persist in side.tsx**

Replace `apps/mobile/app/(onboarding)/side.tsx` with the same pattern for `court_side`, advancing to `/(onboarding)/jammer-plus`:

```tsx
import { useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ChoiceRow, OnboardingStep } from '@/components/OnboardingStep';

export default function SideStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const update = useUpdateProfile();
  const [side, setSide] = useState<string | null>(null);

  const goNext = () => router.push('/(onboarding)/jammer-plus');

  const onContinue = async () => {
    if (update.isPending) return;
    if (side) {
      try {
        await update.mutateAsync({ court_side: side });
      } catch {
        /* re-promptable on relaunch; don't hard-block onboarding */
      }
    }
    goNext();
  };

  return (
    <OnboardingStep
      title={t('sideTitle')}
      body={t('sideBody')}
      primaryLabel={t('continue')}
      primaryDisabled={update.isPending}
      onPrimary={onContinue}
      onSkip={goNext}
    >
      <ChoiceRow
        value={side}
        onChange={setSide}
        options={[
          { key: 'left', label: t('sideLeft') },
          { key: 'right', label: t('sideRight') },
        ]}
      />
    </OnboardingStep>
  );
}
```

> Verify `UpdateProfileInput` accepts `dominant_hand`/`court_side` (it does — Edit Profile updates them). If the column values are constrained (CHECK), `'left'`/`'right'` match the `ChoiceRow` option keys, which match the existing profile-edit values.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add 'apps/mobile/app/(onboarding)/hand.tsx' 'apps/mobile/app/(onboarding)/side.tsx'
git commit -m "feat(onboarding): persist hand + court-side on Continue"
```

---

## Task 2: Boot resume-at-first-unanswered

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Widen the Target type + resolve the onboarding sub-route**

In `apps/mobile/app/_layout.tsx`:

Change the `Target` type to carry the concrete onboarding route:

```tsx
type OnboardingRoute =
  | '/(onboarding)/location'
  | '/(onboarding)/hand'
  | '/(onboarding)/side'
  | '/(onboarding)/jammer-plus';
type Target = '(tabs)' | 'welcome' | 'sign-in' | OnboardingRoute;
```

In `resolve()`, when authed, select the onboarding fields and return the first unanswered route:

```tsx
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarded_at, location_text, dominant_hand, court_side')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profile?.onboarded_at) return '(tabs)';
        // Not onboarded (or no profile row yet) -> resume at the first unanswered step.
        if (!profile?.location_text) return '/(onboarding)/location';
        if (!profile?.dominant_hand) return '/(onboarding)/hand';
        if (!profile?.court_side) return '/(onboarding)/side';
        return '/(onboarding)/jammer-plus';
      }
```

- [ ] **Step 2: Route the onboarding sub-route**

In the routing block (the `if (target === '(tabs)') … else …` ladder), replace the fixed
`'(onboarding)'` branch with a fallthrough that routes any onboarding path directly:

```tsx
      if (target === '(tabs)') router.replace('/(tabs)');
      else if (target === 'welcome') router.replace('/(auth)/welcome');
      else if (target === 'sign-in') router.replace('/(auth)/sign-in');
      else router.replace(target); // target is an OnboardingRoute string
```
(`router.replace(target)` — `target` is a typed-route string literal; if the typed-route checker complains, cast `router.replace(target as never)`, matching the repo's existing `as never` route pattern.)

> The two timeout/catch fallback paths in `run()` still return `'sign-in'`/`'welcome'` — unchanged. No-profile-row → `location_text` undefined → `/(onboarding)/location` (same as before for brand-new users).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add 'apps/mobile/app/_layout.tsx'
git commit -m "feat(onboarding): Boot resumes at first unanswered step (AU-21)"
```

- [ ] **Step 5: Simulator smoke (deferred — document, don't run here)**

New account → location step; set location, Continue → hand; pick a hand, Continue; force-quit; relaunch → resumes at `/side` (location+hand persisted). Skip a step → value stays null → relaunch re-prompts that step. Finish at jammer-plus → `onboarded_at` set → tabs.

---

## Verification gate (whole phase)

```bash
pnpm -w typecheck
# Behavioral resume/persist verified on a dev build/simulator (deferred).
```

---

## Self-Review

**Spec coverage:**
- Persist hand on Continue, not on Skip → Task 1 hand.tsx (`onContinue` persists if `hand`, `onSkip` = `goNext`). ✓
- Persist court_side likewise → Task 1 side.tsx. ✓
- Boot resume at first unanswered (location→hand→side→jammer-plus) → Task 2. ✓
- `onboarded_at` set → tabs (unchanged); no profile row → location → Task 2. ✓
- No migration; reuse `useUpdateProfile` → respected. ✓

**Placeholder scan:** none — full code in both screen replacements + the Boot edits.

**Type consistency:** `useUpdateProfile().mutateAsync({ dominant_hand })` / `({ court_side })` use `UpdateProfileInput` fields (verified present). `primaryDisabled`/`onPrimary`/`onSkip` match `OnboardingStep`'s props. `Target` widened to include `OnboardingRoute`; the routing ladder handles all variants; `resolve()` returns the new literals. The onboarding route strings match the existing screen paths.

**Known edge:** a skipped (null) step re-prompts on relaunch — accepted per the spec (no reached-tracking).
