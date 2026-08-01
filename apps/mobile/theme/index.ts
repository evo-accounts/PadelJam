/**
 * The mobile face of the shared design tokens.
 *
 * Everything here comes from `@padel/ui`, which is also what generates web's
 * CSS — so a value cannot change on one platform only. This module exists to
 * reshape those tokens for React Native (px numbers rather than rem strings,
 * `fontWeight` string literals, no `calc`) and to give call sites short names.
 *
 * WHAT TO USE:
 *   colors.foreground      not '#0b1f3a'
 *   radius.lg              not 12
 *   type.body.size         not 16
 *   space[4]               not 16
 *
 * `scripts/check-hex-budget.mjs` fails CI if the number of raw hex literals in
 * apps/mobile ever RISES, so new code has to come here. Once the count reaches
 * zero the budget is replaced by an ESLint rule and deleted.
 *
 * LIGHT ONLY, deliberately. `@padel/ui` also exports a `dark` scheme, but
 * nothing renders it yet and it carries a known defect (its background and
 * primary are the same colour). Wiring a theme switch is its own change.
 */
import {
  light,
  palette,
  radius as sharedRadius,
  space as sharedSpace,
  text as sharedText,
  weight as sharedWeight,
} from '@padel/ui';

/** Semantic colours. Prefer these over anything in `palette`. */
export const colors = light;

/**
 * Raw ramps, for the rare case a semantic token genuinely does not exist yet.
 * Reaching for this is a smell: if a colour has a meaning, it belongs in
 * `packages/ui/src/tokens/semantic.ts` so web gets it too.
 */
export { palette };

export const radius = sharedRadius;
export const space = sharedSpace;
export const weight = sharedWeight;

/**
 * Type styles, named by ROLE rather than by size.
 *
 * Mobile currently uses 17 distinct font sizes across 613 declarations; naming
 * the role rather than the number is what stops an 18th appearing. Each maps
 * onto the shared Tailwind step, so `title` here and `text-2xl` on web are the
 * same type.
 */
export const type = {
  display: { ...sharedText['3xl'], fontWeight: sharedWeight.bold },
  title: { ...sharedText['2xl'], fontWeight: sharedWeight.bold },
  heading: { ...sharedText.xl, fontWeight: sharedWeight.semibold },
  sectionTitle: { ...sharedText.lg, fontWeight: sharedWeight.semibold },
  body: { ...sharedText.base, fontWeight: sharedWeight.normal },
  bodyStrong: { ...sharedText.base, fontWeight: sharedWeight.semibold },
  label: { ...sharedText.sm, fontWeight: sharedWeight.semibold },
  caption: { ...sharedText.sm, fontWeight: sharedWeight.normal },
  hint: { ...sharedText.xs, fontWeight: sharedWeight.normal },
} as const;

export type TypeRole = keyof typeof type;
