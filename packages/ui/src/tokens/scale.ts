/**
 * Type, spacing and weight scales, in points/px.
 *
 * UNLIKE COLOUR, THESE ARE AUTHORED RATHER THAN MIGRATED. Web's palette was a
 * real source of truth to adopt; its numeric scales were not — web never
 * customised them, so it has been running on stock Tailwind. These values are
 * therefore transcribed from tailwindcss@4.3.0's own `theme.css`, so that a
 * number here and a Tailwind utility there mean the same thing.
 *
 * Verified against the installed package, not recalled:
 *   --text-sm: 0.875rem, --text-sm--line-height: calc(1.25 / 0.875)  -> 14 / 20
 *   --spacing: 0.25rem                                                -> 4
 */

/**
 * Font sizes with their Tailwind line-heights, both resolved to px.
 *
 * Tailwind expresses line-height as a unitless ratio — `calc(1.25 / 0.875)` for
 * `sm` — which multiplies out to 20px at 14px. React Native wants absolute
 * numbers, so they are pre-multiplied here.
 *
 * NOTE FOR THE MOBILE MIGRATION: mobile's two most-used sizes after 16 are 15
 * (119 uses) and 13 (101 uses), and NEITHER is on this scale — each sits exactly
 * between two steps. Under "strict canon" they round; which way is a decision
 * per text role during migration, deliberately not pre-empted here.
 */
export const text = {
  xs: { size: 12, lineHeight: 16 },
  sm: { size: 14, lineHeight: 20 },
  base: { size: 16, lineHeight: 24 },
  lg: { size: 18, lineHeight: 28 },
  xl: { size: 20, lineHeight: 28 },
  '2xl': { size: 24, lineHeight: 32 },
  '3xl': { size: 30, lineHeight: 36 },
  '4xl': { size: 36, lineHeight: 40 },
} as const;

/**
 * Spacing, keyed by Tailwind's own step numbers rather than t-shirt sizes.
 *
 * Deliberate: `space[4]` here is exactly `p-4` there (16px). Inventing
 * `space.md` would make the two platforms describe the same gap with different
 * words, which is the drift this whole exercise exists to remove.
 *
 * Tailwind's base is `--spacing: 0.25rem`, so step n = n × 4px. Only the steps
 * mobile actually uses are listed; add more as needed rather than generating a
 * long tail nobody references.
 */
export const space = {
  0: 0,
  1: 4,
  // Half steps, for the button's sm padding and md/lg gap (Figma `spacing-1,5`
  // and `spacing-2,5`). Same as Tailwind's `p-1.5` / `p-2.5`.
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Base multiplier, so an unlisted step can be computed: `SPACE_STEP_PX * 7`. */
export const SPACE_STEP_PX = 4;

/**
 * Font weights as React Native's string literals.
 *
 * Only the five mobile actually uses (700 ×226, 600 ×162, 500 ×18, 800 ×12,
 * 400 ×1). Names match Tailwind's so `weight.semibold` and `font-semibold` are
 * the same thing.
 *
 * CAVEAT for a custom font: RN does not synthesise weights, so a name only means
 * something if the face ships that weight. Outfit, the text face on both
 * platforms, ships all five (mobile embeds them; see apps/mobile/theme `font`).
 * Atelia, the display face, ships only Regular — pair it with `normal` alone.
 */
export const weight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export type Text = typeof text;
export type TextName = keyof Text;
export type Space = typeof space;
export type SpaceStep = keyof Space;
export type Weight = typeof weight;
export type WeightName = keyof Weight;
