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
 *   type.body              not { fontSize: 16 }
 *   space[4]               not 16
 *
 * THIS DIRECTORY IS THE ONLY PLACE A COLOUR MAY BE SPELLED OUT. Everywhere else
 * in apps/mobile, `no-restricted-syntax` rejects a raw hex or rgba outright —
 * see `apps/mobile/eslint.config.mjs`. That rule replaced a ratchet script which
 * took the count from 1316 to 0; the script is gone, and the rule is what keeps
 * it there.
 *
 * LIGHT ONLY, deliberately. `@padel/ui` also exports a `dark` scheme, but
 * nothing renders it yet and it carries a known defect (its background and
 * primary are the same colour). Wiring a theme switch is its own change.
 */
import type { TextStyle } from 'react-native';

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
 * Theme-aware access to the same tokens. `colors` above stays as the light
 * scheme so the 124 screens that read it at module scope keep working unchanged
 * while they are migrated one at a time — see ThemeProvider.tsx.
 */
export {
  ColorSchemeProvider,
  useColors,
  useScheme,
  useThemedStyles,
  type Scheme,
  type ThemeColors,
} from './ThemeProvider.tsx';

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
 *
 * These are REACT NATIVE TEXT STYLES, not raw scale entries: the shared scale
 * calls the field `size`, RN calls it `fontSize`. Translating here is the whole
 * reason this module exists — it means a role can be dropped straight into a
 * stylesheet (`display: type.display`) or spread (`{...type.body, color}`)
 * instead of every call site rewriting the same three keys.
 */
const role = (step: { size: number; lineHeight: number }, fontWeight: TextStyle['fontWeight']) =>
  ({ fontSize: step.size, lineHeight: step.lineHeight, fontWeight }) satisfies TextStyle;

export const type = {
  display: role(sharedText['3xl'], sharedWeight.bold),
  title: role(sharedText['2xl'], sharedWeight.bold),
  heading: role(sharedText.xl, sharedWeight.semibold),
  sectionTitle: role(sharedText.lg, sharedWeight.semibold),
  body: role(sharedText.base, sharedWeight.normal),
  bodyStrong: role(sharedText.base, sharedWeight.semibold),
  label: role(sharedText.sm, sharedWeight.semibold),
  caption: role(sharedText.sm, sharedWeight.normal),
  hint: role(sharedText.xs, sharedWeight.normal),
} as const;

export type TypeRole = keyof typeof type;
