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
 * Sizes are one stage behind: literal `fontSize` and `borderRadius` are still
 * spread across unmigrated screens, so they are held by a decreasing budget in
 * `scripts/check-size-budget.mjs` rather than by a rule. Lower it whenever a
 * change takes a screen onto `Text` and `radius`; it becomes a rule at zero.
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
 * Raw ramps, for the rare case a semantic token genuinely does not exist yet.
 * Reaching for this is a smell: if a colour has a meaning, it belongs in
 * `packages/ui/src/tokens/semantic.ts` so web gets it too.
 */
export { palette };

/**
 * Avatar fallback backgrounds (UX-GLOB-04): eight saturated 700-step colours from the shared
 * ramps, each contrast-checked against white in avatarColour.test.ts. Picked per user id so a
 * person keeps their colour everywhere and is never a grey circle.
 */
export const avatarRamp = [
  palette.purple[700],
  palette.teal[700],
  palette.green[700],
  palette.sky[700],
  palette.blue[700],
  palette.rose[700],
  palette.orange[700],
  palette.red[700],
] as const;

export const radius = sharedRadius;
export const space = sharedSpace;
export const weight = sharedWeight;

/**
 * The top-corner radius of the welcome screen's sheet — Figma's
 * `border radius/4xl` variable, which resolves to 26 in the PJAM Mobile file
 * (Tailwind's own `4xl` is 32, so the NAME is not a reliable guide to the value).
 *
 * Deliberately a mobile constant rather than a step on the shared `radius`
 * ladder: web has no sheet like this, and a `radius['4xl']` in `@padel/ui` would
 * oblige `globals.css` to grow a `--radius-4xl` nobody consumes. If a second
 * surface wants it, that is the day to promote it.
 */
export const sheetRadius = 26;

/**
 * The two faces, by the family names the native build registers them under
 * (`expo-font` in app.json embeds the files in assets/fonts).
 *
 * `sans` is Outfit, the design system's text face and the one web already loads
 * through next/font. It ships the five static weights mobile uses (400–800), so
 * `fontWeight` keeps meaning what it says: iOS picks the matching file inside
 * the family, and the plugin gives Android an XML family with the same weights.
 *
 * `display` is Atelia, which ships a single Regular: a title face, never body
 * text. Do not pair it with a heavier weight — RN does not synthesise bold, so
 * the request is quietly ignored and the title renders Regular anyway.
 *
 * Every `type` role carries a family, and `components/ui/native` puts `sans` on
 * any raw Text or TextInput, so nothing falls back to the system face.
 */
export const font = {
  sans: 'Outfit',
  display: 'Atelia',
} as const;

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
const role = (
  step: { size: number; lineHeight: number },
  fontWeight: TextStyle['fontWeight'],
  fontFamily: string = font.sans,
) => ({ fontFamily, fontSize: step.size, lineHeight: step.lineHeight, fontWeight }) satisfies TextStyle;

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
  // Button labels are Outfit Medium in the design system, at the size the
  // button's own metrics pick (packages/ui button.ts) — hence three steps.
  buttonXs: role(sharedText.xs, sharedWeight.medium),
  button: role(sharedText.sm, sharedWeight.medium),
  buttonLg: role(sharedText.base, sharedWeight.medium),
  // The welcome slides' title and the paragraph under it: `text-4xl` and
  // `text-lg` regular. Neither size was on any role (the largest was `display`,
  // 30/36), and the design calls for them as a PAIR, so they arrive as a pair.
  //
  // The title is the design's serif slot, Atelia. It ships only Regular, so the
  // weight is Regular too — see `font` above for why asking for bold would be
  // a lie the renderer quietly ignores.
  heroTitle: role(sharedText['4xl'], sharedWeight.normal, font.display),
  heroBody: role(sharedText.lg, sharedWeight.normal),
} as const;

export type TypeRole = keyof typeof type;
