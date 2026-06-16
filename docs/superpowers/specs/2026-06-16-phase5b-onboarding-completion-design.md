# Phase 5B — Onboarding Completion — Design

*Padel Jam • 2026-06-16 • Brainstormed design / spec*

## Goal

Fix two onboarding gaps: the **hand** and **court-side** steps currently select a value into local
state but **never persist** it, and `Boot()` always resumes a not-onboarded user at `/location`
regardless of progress. Persist each step on Continue and resume at the **first unanswered** step
(**AU-21**). Small, client-only; no migration (the `dominant_hand`/`court_side` columns +
`useUpdateProfile` already exist).

## Scope decisions (from the 5B brainstorm)
1. **Continue persists, Skip doesn't.** `Continue` writes the selected value then navigates; `Skip`
   navigates without persisting (skip = intentionally unanswered, per AU-18, which is built). If
   Continue is tapped with nothing selected, it just navigates (value stays null).
2. **Resume at first unanswered** among location → hand → side, else the `/jammer-plus` gate.
3. **No "reached vs answered" tracking** — a skipped (null) step may re-prompt on relaunch; the user
   skips again. Matches AU-21's intent; richer tracking is out of scope (YAGNI).

## Verified context
- `apps/mobile/app/(onboarding)/hand.tsx` + `side.tsx`: select into local state; both `onPrimary`
  (Continue) and `onSkip` call the same `next()` → navigate only. Values map to `profiles.dominant_hand`
  / `profiles.court_side` ('left'/'right').
- `location.tsx`: already persists `location_text` + `location_point` via the `set_my_location` RPC.
- `jammer-plus.tsx`: sets `profiles.onboarded_at` on Continue/Skip (the gate).
- `useUpdateProfile` (`packages/api/src/profile/mutations.ts`): `db.from('profiles').update(input)` —
  `UpdateProfileInput` already supports `dominant_hand`/`court_side` (used by Edit Profile).
- `Boot()` (`apps/mobile/app/_layout.tsx`): selects `onboarded_at`; `onboarded_at` set → `/(tabs)`,
  else → `/(onboarding)/location` (always location).

## Architecture / changes

### `apps/mobile/app/(onboarding)/hand.tsx`
Split Continue from Skip:
- `onPrimary`: if a value is selected, `await updateProfile.mutateAsync({ dominant_hand: hand })`,
  then `router.push('/(onboarding)/side')`. (If `hand` is null, skip the write and just navigate.)
- `onSkip`: `router.push('/(onboarding)/side')` (no write).
Use `useUpdateProfile` from `@padel/api`. Disable the primary briefly while the write is in flight to
avoid a double-tap; surface a write failure inline (don't block navigation hard — a failed write can
fall through to navigate, since the value is re-promptable).

### `apps/mobile/app/(onboarding)/side.tsx`
Same pattern: `onPrimary` persists `court_side` (if selected) then `router.push('/(onboarding)/jammer-plus')`;
`onSkip` navigates without persisting.

### `apps/mobile/app/_layout.tsx` — `Boot()`
- Extend the profile read to `select('onboarded_at, location_text, dominant_hand, court_side')`.
- When authed and `onboarded_at` is null, compute the resume route:
  `!location_text → /(onboarding)/location`; else `!dominant_hand → /(onboarding)/hand`;
  else `!court_side → /(onboarding)/side`; else `/(onboarding)/jammer-plus`.
- `onboarded_at` set → `/(tabs)` (unchanged). The `Target` union / routing switch is extended so the
  onboarding target carries the specific sub-route (e.g. return the concrete path string for the
  onboarding case rather than a fixed `/location`).

## Error handling
- A failed step write (`updateProfile`) shows a brief inline error but still lets the user proceed
  (the value is re-promptable on the next relaunch via the resume logic) — onboarding never hard-blocks.
- Boot read failure falls back to the existing behaviour (route to `/(onboarding)/location`).

## Explicitly deferred
- "Reached vs answered" tracking (re-prompting skipped steps is accepted).
- Push-notification permission prompt (AU-23) and the map/autocomplete location UI — separate items.

## Conventions followed
Client-only; `useUpdateProfile` for the writes; `useT('onboarding')` copy unchanged (no new keys
needed — reuse existing); Boot routing pattern preserved (just a richer onboarding target).
