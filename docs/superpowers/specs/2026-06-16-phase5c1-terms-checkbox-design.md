# Phase 5C-1 — Terms & Conditions Checkbox — Design

*Padel Jam • 2026-06-16 • Brainstormed design / spec*

## Goal

Close **AU-15**: a required Terms of Use / Privacy Policy checkbox on the Create-account screen that
gates the Continue button. First slice of 5C (Auth recovery + Terms); the connected recovery flow is
**5C-2**.

## Scope (from the 5C brainstorm)
- Standalone, tiny slice; client-only; no backend/migration/new component file (inline checkbox).
- The recovery flow (Try-another-way sheet, password sign-in, email-OTP recovery, AU-07) is 5C-2.

## Verified context
- `apps/mobile/app/(auth)/create-account.tsx`: holds `fullName`/`secondary`/`password`/`busy`/`error`
  state; `onSubmit` early-returns when `!name || !secondaryValue || !password`; a Continue `Pressable`
  submits. No terms UI.
- `TERMS_URL = 'https://padeljam.app/terms'` / `PRIVACY_URL = 'https://padeljam.app/privacy'` already
  exist in `apps/mobile/app/profile/settings.tsx`; `Linking.openURL` is the established pattern.
- No checkbox component in the repo — render inline.

## Architecture / changes

### `apps/mobile/app/(auth)/create-account.tsx`
- Add `const [agreed, setAgreed] = useState(false)`.
- Add a **checkbox row** above the Continue button:
  - A tappable box (`Pressable`): a bordered square that shows a check glyph (e.g. `✓`) when `agreed`,
    toggling `setAgreed`.
  - A sentence with two tappable links: "I agree to the **Terms of Use** and **Privacy Policy**",
    where "Terms of Use" → `Linking.openURL(TERMS_URL)` and "Privacy Policy" → `Linking.openURL(PRIVACY_URL)`.
    Compose from i18n fragments so the two links are independently tappable `Text` spans.
- **Gate Continue:** add `!agreed` to the button's disabled condition (alongside the existing
  `busy`/empty-field checks) and early-return from `onSubmit` if `!agreed`.
- Define `TERMS_URL`/`PRIVACY_URL` locally in this screen (mirroring `settings.tsx`) — small dup is
  acceptable; or import from a shared constant if one is introduced (YAGNI: local is fine for now).

### i18n (`auth` namespace, `apps/mobile/lib/i18n-mobile.ts`)
- `termsAgreePrefix` ("I agree to the "), `termsLink` ("Terms of Use"), `termsAnd` (" and "),
  `privacyLink` ("Privacy Policy"). Split so the sentence renders with two tappable link spans.

## Error handling / edge cases
- Continue is visually disabled (reduced opacity) and non-functional until `agreed` is true AND the
  required fields are filled; the `onSubmit` guard is the backstop.
- Link taps are fire-and-forget `Linking.openURL` (no failure UI needed — matches `settings.tsx`).

## Explicitly deferred (→ 5C-2)
Try-another-way sheet (AU-10), password sign-in fallback (AU-11), password recovery via email OTP
(AU-12/13), lazy secondary-identifier verification (AU-07).

## Conventions followed
Client-only; `Linking.openURL` like `settings.tsx`; `useT('auth')`; inline checkbox (no new dep);
existing create-account state/gating pattern extended.
