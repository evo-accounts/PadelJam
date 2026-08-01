/**
 * The migration table: which token replaces which hardcoded colour, and in what
 * role.
 *
 * KEYED ON (style property, hex) — NOT on hex alone, which would be wrong 25
 * times over. Measured across apps/mobile/{app,components,lib}:
 *
 *   color:           '#0b1f3a'  × 236     -> primary TEXT
 *   backgroundColor: '#0b1f3a'  ×  52     -> dark CTA / splash FILL
 *   color:           '#fff'     ×  98     -> text on a dark fill
 *   backgroundColor: '#fff'     × 132     -> card surface
 *
 * One hex, four meanings. 98 distinct (property, hex) pairs come from just 73
 * distinct hexes, so a find-and-replace keyed on the colour would collapse
 * roles that must stay apart.
 *
 * THIS IS A REDESIGN, NOT A REFACTOR. Web's palette is canonical and mobile's
 * navy/blue has no counterpart in it, so screens will visibly change: navy text
 * becomes slate, bright blue and dark fills become purple, borders lighten.
 * That follows from the "strict canon" decision — the acceptance gate is
 * screenshot review of the design-system gallery, before any screen migrates.
 *
 * Not machinery: this is a reviewed decision table that a codemod (or a person)
 * reads. Every entry is a judgement about what a colour MEANT.
 */
import { colors, palette } from './index.ts';

/** A token reference, as it should appear at the call site. */
type Token = { readonly token: string; readonly value: string; readonly note?: string };

const t = (token: string, value: string, note?: string): Token => ({ token, value, note });

/**
 * Text colours. The dominant navy is primary text, not a brand accent — 236 of
 * its 300 uses are `color`.
 */
export const textColors: Record<string, Token> = {
  '#0b1f3a': t('colors.foreground', colors.foreground, 'primary text (236 uses)'),
  '#3a4a60': t('colors.mutedForeground', colors.mutedForeground, 'secondary text (33)'),
  '#6b7685': t('colors.mutedForeground', colors.mutedForeground, 'muted text (91)'),
  '#8a95a5': t('palette.slate[400]', palette.slate[400], 'tertiary text (33)'),
  '#fff': t('colors.card', colors.card, 'text on a dark fill (98)'),
  '#ffffff': t('colors.card', colors.card, 'text on a dark fill'),
  '#0b7bff': t('colors.primary', colors.primary, 'link / accent text (50)'),
  '#6b4eff': t('colors.primary', colors.primary, 'second accent blue-purple'),
  '#d7263d': t('colors.destructive', colors.destructive, 'error text (28)'),
  '#c0392b': t('colors.destructive', colors.destructive, 'second error red (19)'),
  '#444': t('colors.mutedForeground', colors.mutedForeground, 'grey text (12)'),
  '#666': t('colors.mutedForeground', colors.mutedForeground),
  '#888': t('palette.slate[400]', palette.slate[400]),
  '#1a7f4b': t('colors.success', colors.success, 'success text'),
  '#1f9d55': t('colors.success', colors.success),
  '#2e9e5b': t('colors.success', colors.success),
};

/**
 * Fills. The navy fills are the entries that visibly change most: web has no
 * navy, and per the brand decision they become `primary` (purple).
 */
export const backgroundColors: Record<string, Token> = {
  '#fff': t('colors.card', colors.card, 'card surface (132 uses)'),
  '#ffffff': t('colors.card', colors.card),
  '#0b1f3a': t('colors.primary', colors.primary, 'dark CTA / splash (52) — VISIBLY CHANGES: navy -> purple'),
  '#0b7bff': t('colors.primary', colors.primary, 'primary action (48)'),
  '#f0f3f8': t('colors.muted', colors.muted, 'raised surface (29)'),
  '#f7f9fc': t('colors.background', colors.background, 'page background (24)'),
  '#f4f6fa': t('colors.background', colors.background, 'page background (15)'),
  '#f6f8fb': t('colors.background', colors.background),
  '#f2f5fa': t('colors.background', colors.background),
  '#f2f5f9': t('colors.background', colors.background),
  '#e6eaf0': t('colors.muted', colors.muted, 'inset surface (22)'),
  '#eef2f7': t('colors.accent', colors.accent, 'subtle surface (8)'),
  '#e6f0ff': t('palette.purple[100]', palette.purple[100], 'accent tint'),
  '#eaf2ff': t('palette.purple[100]', palette.purple[100]),
  '#eaf3ff': t('palette.purple[100]', palette.purple[100]),
  '#e3f5ea': t('palette.green[100]', palette.green[100], 'success tint'),
  '#d7263d': t('colors.destructive', colors.destructive),

  // Added while migrating app/event/[id]/**. Each was a one- or two-use tint
  // that no existing entry covered; they are listed rather than folded into the
  // nearest neighbour so the judgement stays visible.
  '#fcebec': t('palette.red[100]', palette.red[100], 'error banner tint'),
  '#ede7ff': t('palette.purple[100]', palette.purple[100], 'accent tint, already purple'),
  '#eef1f6': t('colors.accent', colors.accent, 'subtle surface — also a border elsewhere'),
  '#1a7f4b': t('colors.success', colors.success, 'solid success FILL, not the text green'),
};

/**
 * Borders. Note web's `--border` (#f1f5f9) is markedly lighter than mobile's
 * #e6eaf0. Under strict canon it is adopted as-is, which WILL flatten card
 * edges — flagged here so the screenshot review knows to look for it.
 */
export const borderColors: Record<string, Token> = {
  '#e6eaf0': t('colors.border', colors.border, 'hairline (46 across borderColor/borderBottomColor) — LIGHTENS'),
  '#eef2f7': t('colors.border', colors.border),
  '#eef1f6': t('colors.border', colors.border),
  '#e7ecf3': t('colors.border', colors.border),
  '#edf1f6': t('colors.border', colors.border),
  '#e2e8f0': t('colors.muted', colors.muted, 'already a Tailwind slate-200'),
  '#d7dee8': t('colors.border', colors.border),
  '#ccc': t('colors.border', colors.border, 'grey hairline (28)'),
  '#0b7bff': t('colors.primary', colors.primary, 'selected outline (13)'),
  '#0b1f3a': t('colors.foreground', colors.foreground, 'strong outline (8)'),
  '#d7263d': t('colors.destructive', colors.destructive),
};

/**
 * Scrims and shadows. These stay rgba — there is no semantic token for a
 * translucent overlay yet, and inventing one belongs in packages/ui so web
 * gets it too, not here.
 */
export const overlays: Record<string, Token> = {
  'rgba(0,0,0,0.35)': t('(unmapped)', 'rgba(0,0,0,0.35)', 'modal scrim — needs an `overlay` token in packages/ui'),
  'rgba(11,31,58,0.55)': t('(unmapped)', 'rgba(11,31,58,0.55)', 'navy scrim — re-express against the new palette'),

  // A shadow is not a surface: `#000` here means "cast a shadow", and every
  // shadow in the app should agree on its colour. `foreground` is what Card
  // already uses, so shadows converge on it rather than on pure black.
  '#000': t('colors.foreground', colors.foreground, 'shadow colour'),
  '#000000': t('colors.foreground', colors.foreground, 'shadow colour'),
};

/** Lookup used by a codemod: property first, then hex. */
export const colorMap = {
  color: textColors,
  tintColor: textColors,
  // Placeholder text is text: it takes the same ramp, just a lighter step.
  placeholderTextColor: textColors,
  backgroundColor: backgroundColors,
  borderColor: borderColors,
  borderBottomColor: borderColors,
  borderTopColor: borderColors,
  borderLeftColor: borderColors,
  borderRightColor: borderColors,
  shadowColor: overlays,
} as const;

export type ColorMap = typeof colorMap;
