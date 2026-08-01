/**
 * Semantic tokens — what a colour MEANS, rather than what it is.
 *
 * These are the names both platforms should use. Web reaches them as Tailwind
 * utilities (`bg-primary`, `text-muted-foreground`); mobile reaches them as
 * `colors.primary` via `apps/mobile/theme`. Nothing outside this file should
 * name a raw ramp value.
 *
 * Transcribed from the `:root` and `.dark` blocks of
 * `apps/web/src/app/globals.css`, which is now generated from here.
 */
import { palette as p } from './palette.ts';

/** Light mode — the "Default" mode of the source Themes collection. */
export const light = {
  background: p.slate[50],
  foreground: p.slate[800],
  card: p.white,
  cardForeground: p.purple[900],
  popover: p.white,
  popoverForeground: p.purple[900],
  primary: p.purple[500],
  primaryForeground: p.slate[800],
  secondary: p.green[500],
  secondaryForeground: p.black,
  muted: p.slate[200],
  mutedForeground: p.slate[700],
  accent: p.slate[100],
  accentForeground: p.slate[900],
  destructive: p.red[600],
  destructiveForeground: p.white,
  info: p.sky[600],
  infoForeground: p.white,
  success: p.green[600],
  successForeground: p.white,
  warning: p.yellow[500],
  warningForeground: p.black,
  /**
   * The status colours AS TEXT on a light surface.
   *
   * Separate tokens because `success` and `warning` each do two jobs: a solid
   * FILL (a button, a badge) and a TEXT colour on the page. One value cannot
   * serve both — measured on the page background, `success` reaches only 2.89
   * and `warning` 2.05, where body text needs 4.5. Darkening the shared token
   * would fix the text and simultaneously darken every fill, flipping
   * `warningForeground` from black to white and changing surfaces that were
   * already approved at the screenshot review.
   *
   * So the fills keep their approved values and text gets its own step:
   * green-700 (4.77) and yellow-700 (4.80).
   *
   * `info` is the same class of problem at 3.91 and has no `infoStrong` yet —
   * it was left out deliberately rather than overlooked, pending a decision.
   */
  successStrong: p.green[700],
  warningStrong: p.yellow[700],
  border: p.slate[100],
  input: p.slate[100],
  ring: p.slate[400],
  /**
   * The scrim behind a modal or sheet.
   *
   * Mobile had FOUR alphas for this one idea — 0.25, 0.35, 0.4 and 0.6 — with
   * no evidence any of them was chosen rather than copied from the last file.
   * They collapse onto 0.4, the darkest of the three common values, so a modal
   * reads unambiguously as modal. Some sheets get a slightly dimmer backdrop
   * than before; that IS the consolidation, not a side effect of it.
   *
   * Deliberately not a ramp step: a scrim has to be translucent, or it hides
   * the content it is meant to be dimming.
   */
  overlay: 'rgba(0, 0, 0, 0.4)',
  chart1: p.orange[600],
  chart2: p.teal[600],
  chart3: p.sky[600],
  chart4: p.yellow[400],
  chart5: p.yellow[500],
  sidebar: p.slate[50],
  sidebarForeground: p.slate[950],
  sidebarPrimary: p.slate[900],
  sidebarPrimaryForeground: p.slate[50],
  sidebarAccent: p.slate[100],
  sidebarAccentForeground: p.slate[900],
  sidebarBorder: p.slate[200],
  sidebarRing: p.slate[400],
} as const;

/**
 * Dark mode — repaired from the "-dark" variants of the source collection.
 *
 * STILL NOT WIRED UP. Nothing adds the `.dark` class (no next-themes, no
 * ThemeProvider on web; mobile's `theme` is light-only), so this does not render
 * yet. It is now correct when something does.
 *
 * The original was transcribed verbatim during the token migration, defects
 * included, so that step could be a pure refactor. Those defects are fixed here,
 * as their own change. A WCAG audit of every pair the token NAMES promise —
 * each `xForeground` against its `x`, plus "can you see this element on the
 * page at all" — found five, not the one that was known:
 *
 *   primary was purple-900, IDENTICAL to background   1.00  invisible button
 *   destructive-foreground was white on red-400       2.77  fails AA
 *   sidebar-primary-foreground was slate-900 on blue  2.66  fails AA
 *   card was slate-900 on a purple-900 page           1.07  invisible card
 *   secondary was green-900 on a purple-900 page      1.36  invisible button
 *
 * The repair follows one rule, the same one light already obeys: a FILL is
 * light and carries dark text, or dark and carries light text — never the same
 * lightness as the surface behind it. So the solid accents (primary, secondary,
 * success) move to their 400 step with a 950 foreground, and the surfaces stay
 * dark and keep light text.
 *
 * Every text pair now clears AA (4.5) and nothing is invisible. `card` on
 * `background` is deliberately still subtle at 1.18 — dark-mode cards separate
 * by their border, not by fill, and the border sits at 2.08 against it.
 *
 * LIGHT IS UNCHANGED. It ships, and its values are the agreed canon — including
 * the deliberately faint border. Nothing here touches it.
 */
export const dark = {
  background: p.purple[900],
  foreground: p.slate[50],
  card: p.purple[800],
  cardForeground: p.slate[50],
  popover: p.black,
  popoverForeground: p.slate[50],
  primary: p.purple[400],
  primaryForeground: p.purple[950],
  secondary: p.green[400],
  secondaryForeground: p.green[950],
  muted: p.slate[600],
  mutedForeground: p.slate[100],
  accent: p.slate[800],
  accentForeground: p.slate[50],
  destructive: p.red[400],
  destructiveForeground: p.red[950],
  info: p.sky[800],
  infoForeground: p.white,
  success: p.green[400],
  successForeground: p.green[950],
  warning: p.yellow[600],
  warningForeground: p.black,
  // Mirrored: on a dark page the legible step is a LIGHT one, not a dark one.
  successStrong: p.green[300],
  warningStrong: p.yellow[300],
  border: p.purple[700],
  input: 'rgba(255, 255, 255, 0.15)',
  ring: p.slate[500],
  // Heavier in dark mode: the same alpha over an already-dark page does not
  // separate the sheet from what is behind it.
  overlay: 'rgba(0, 0, 0, 0.6)',
  chart1: p.blue[700],
  chart2: p.teal[900],
  chart3: p.sky[900],
  chart4: p.purple[500],
  chart5: p.rose[500],
  sidebar: p.slate[900],
  sidebarForeground: p.slate[50],
  sidebarPrimary: p.blue[700],
  sidebarPrimaryForeground: p.slate[50],
  sidebarAccent: p.slate[800],
  sidebarAccentForeground: p.slate[50],
  sidebarBorder: 'rgba(255, 255, 255, 0.1)',
  sidebarRing: p.slate[500],
} as const;

export const semantic = { light, dark } as const;

export type SemanticName = keyof typeof light;

/**
 * A colour scheme: light's KEYS, with any string value.
 *
 * Deliberately widened from `typeof light`. Because both schemes are `as const`,
 * their values are literal types, so `dark` is not assignable to `typeof light`
 * — the two differ in every value. Widening the values while pinning the keys is
 * what actually wants checking, and it buys key parity for free: adding a token
 * to `light` without adding it to `dark` now fails typecheck instead of
 * producing a half-themed dark mode nobody notices until it ships.
 */
export type SemanticScheme = { readonly [K in SemanticName]: string };

// Assert the parity described above. `satisfies` keeps dark's literal types for
// consumers while checking it against the scheme's shape.
const _darkCoversLight: SemanticScheme = dark;
void _darkCoversLight;
