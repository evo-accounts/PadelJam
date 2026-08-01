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
  border: p.slate[100],
  input: p.slate[100],
  ring: p.slate[400],
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
 * Dark mode — the "-dark" variants of the source collection.
 *
 * NOT SHIPPED. Nothing adds the `.dark` class today (no next-themes, no
 * ThemeProvider on web; mobile's inline styles bypass its navigation theme), so
 * this has never rendered.
 *
 * KNOWN DEFECT, carried over verbatim rather than silently "fixed": `background`
 * and `primary` are both purple-900. A primary button would be invisible on the
 * page background. Transcribing it faithfully keeps this step a pure refactor —
 * the generated CSS must match the file it replaces byte for byte. Fix it as its
 * own change, with a screenshot, when dark mode is actually adopted.
 */
export const dark = {
  background: p.purple[900],
  foreground: p.slate[50],
  card: p.slate[900],
  cardForeground: p.slate[50],
  popover: p.black,
  popoverForeground: p.slate[50],
  primary: p.purple[900], // see the defect note above
  primaryForeground: p.purple[100],
  secondary: p.green[900],
  secondaryForeground: p.green[100],
  muted: p.slate[600],
  mutedForeground: p.slate[100],
  accent: p.slate[800],
  accentForeground: p.slate[50],
  destructive: p.red[400],
  destructiveForeground: p.white,
  info: p.sky[800],
  infoForeground: p.white,
  success: p.green[600],
  successForeground: p.white,
  warning: p.yellow[600],
  warningForeground: p.black,
  border: p.purple[700],
  input: 'rgba(255, 255, 255, 0.15)',
  ring: p.slate[500],
  chart1: p.blue[700],
  chart2: p.teal[900],
  chart3: p.sky[900],
  chart4: p.purple[500],
  chart5: p.rose[500],
  sidebar: p.slate[900],
  sidebarForeground: p.slate[50],
  sidebarPrimary: p.blue[700],
  sidebarPrimaryForeground: p.slate[900],
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
