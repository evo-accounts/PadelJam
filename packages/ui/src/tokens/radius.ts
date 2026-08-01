/**
 * Corner radii, in points/px.
 *
 * Derived from web's `--radius: 0.625rem` (10px) and the four `calc()` steps in
 * the hand-written `@theme inline` block of apps/web/src/app/globals.css:
 *
 *   --radius-sm: calc(var(--radius) - 4px)   ->  6
 *   --radius-md: calc(var(--radius) - 2px)   ->  8
 *   --radius-lg: var(--radius)               -> 10
 *   --radius-xl: calc(var(--radius) + 4px)   -> 14
 *
 * Those `calc()`s stay in CSS (web resolves them at run time); these are the
 * same numbers pre-computed for React Native, which has no `calc`. A unit test
 * asserts the two agree, so the derivation cannot silently drift.
 *
 * NOTE FOR THE MOBILE MIGRATION: mobile's dominant radius today is 12 (129
 * uses), which is NOT on this scale and sits exactly between `lg` (10) and `xl`
 * (14). Under the "strict canon" decision it rounds rather than gaining a step;
 * which way is a per-surface call made during migration, not baked in here.
 * Mobile's `999` pill radius maps to `full`.
 */
export const radius = {
  none: 0,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  /** Pills and circles. RN has no `9999px` keyword; a large number is the idiom. */
  full: 9999,
} as const;

/** The base web value these are derived from, in px. Used by the parity test. */
export const RADIUS_BASE_PX = 10;

export type Radius = typeof radius;
export type RadiusName = keyof Radius;
