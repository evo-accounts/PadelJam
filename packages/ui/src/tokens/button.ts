/**
 * Button tokens — the component tier, one level above `semantic`.
 *
 * Source: the "Custom Button" set in the PJAM Design System Figma file
 * (node 452:4838), 7 styles × 4 sizes × 6 states. Every value names the
 * palette step or semantic token the Figma variable resolves to, so web and
 * mobile render the same button from the same numbers.
 *
 * WHY A SEPARATE TIER. A button's fill is not the brand `primary`: Figma's
 * primary button is purple-900, where `primary` (purple-500) is the accent used
 * for links, the tertiary label and focus. Folding ~45 state colours into
 * `semantic` would bury the ~40 tokens that describe the page under ones that
 * describe one control.
 *
 * LIGHT ONLY, like the rest of the shipped theme. Dark mode is not wired
 * anywhere (see semantic.ts); when it is, this becomes `{ light, dark }`.
 *
 * Deliberate departures from the Figma file, each a defect there rather than a
 * design choice:
 *   - Sizes are normalised to one height each (24/32/44/56). The file has
 *     primary-sm at 32 enabled but 28 in every other state, tertiary-sm at 28,
 *     and xs at 24 or 26 depending on style.
 *   - info's focus ring uses `shadow-info` (sky-600 @ 20%). The file uses an
 *     unbound #0891b2 at the same alpha while success/warning/destructive all
 *     bind their `shadow-*` variable.
 *   - destructive tints use red-600, the `destructive` token itself. The file
 *     tints #e03434, which is on no ramp; at 10–40% alpha the two are
 *     indistinguishable.
 */
import { palette as p } from './palette.ts';
import { light } from './semantic.ts';
import { space, text } from './scale.ts';
import { radius } from './radius.ts';

/** `#rrggbb` at an alpha, as `rgba()` — the form both CSS and React Native accept. */
export function alpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'info'
  | 'success'
  | 'warning'
  | 'destructive';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export type ButtonTone = {
  bg: string;
  bgHover: string;
  /** Pressed. On mobile this is the only interaction state there is. */
  bgActive: string;
  fg: string;
  focusBorder: string;
  /** A 3px spread ring, no blur. */
  focusRing: string;
};

const TRANSPARENT = 'transparent';
/** Figma's "shadow ring" effect, shared by primary, secondary and tertiary. */
const brandRing = alpha(p.purple[500], 0.15);

export const buttonTone: Record<ButtonVariant, ButtonTone> = {
  primary: {
    bg: p.purple[900],
    bgHover: p.purple[800],
    bgActive: p.purple[950],
    fg: p.purple[100],
    focusBorder: light.ring,
    focusRing: brandRing,
  },
  secondary: {
    bg: light.accent,
    bgHover: p.slate[200],
    bgActive: p.slate[300],
    fg: light.mutedForeground,
    focusBorder: light.ring,
    focusRing: brandRing,
  },
  tertiary: {
    bg: TRANSPARENT,
    bgHover: alpha(p.purple[500], 0.1),
    bgActive: alpha(p.purple[500], 0.2),
    fg: light.primary,
    focusBorder: light.primary,
    focusRing: brandRing,
  },
  info: {
    bg: light.info,
    bgHover: p.sky[500],
    bgActive: p.sky[700],
    fg: p.white,
    focusBorder: alpha(p.sky[600], 0.4),
    focusRing: alpha(p.sky[600], 0.2),
  },
  success: {
    bg: light.success,
    // Figma binds hover to green-600, the same value as enabled. Kept as
    // specified; raised with design rather than invented here.
    bgHover: p.green[600],
    bgActive: p.green[700],
    fg: p.white,
    focusBorder: alpha(p.green[500], 0.4),
    focusRing: alpha(p.green[500], 0.2),
  },
  warning: {
    bg: light.warning,
    bgHover: p.yellow[600],
    bgActive: p.yellow[700],
    fg: p.white,
    // Orange, not amber, in the source file (`opacity-warning-dark`).
    focusBorder: alpha(p.orange[500], 0.4),
    focusRing: alpha(p.orange[500], 0.2),
  },
  destructive: {
    bg: alpha(p.red[600], 0.1),
    bgHover: alpha(p.red[600], 0.2),
    bgActive: alpha(p.red[600], 0.3),
    fg: light.destructive,
    focusBorder: alpha(p.red[600], 0.4),
    focusRing: alpha(p.red[600], 0.2),
  },
};

/** `aria-invalid` treatment — the same for every variant. */
export const buttonInvalid = {
  border: alpha(p.red[600], 0.1),
  ring: alpha(p.red[600], 0.2),
} as const;

/** Layer opacity for the disabled state (and mobile's `loading`). */
export const BUTTON_DISABLED_OPACITY = 0.5;

export type ButtonMetrics = {
  height: number;
  paddingX: number;
  gap: number;
  radius: number;
  text: { size: number; lineHeight: number };
  icon: number;
};

export const buttonSize: Record<ButtonSize, ButtonMetrics> = {
  xs: { height: 24, paddingX: space[2], gap: space[1], radius: radius.md, text: text.xs, icon: 12 },
  sm: { height: 32, paddingX: space[2.5], gap: space[1], radius: radius.md, text: text.sm, icon: 14 },
  // 12 is Figma's `rounded-xl`, which is not on the shared ladder (lg 10, xl 14).
  // Web spells it `rounded-[12px]`; keep the two in step if it moves.
  md: { height: 44, paddingX: space[3], gap: space[1.5], radius: 12, text: text.sm, icon: 16 },
  lg: { height: 56, paddingX: space[4], gap: space[1.5], radius: radius['2xl'], text: text.base, icon: 24 },
};
