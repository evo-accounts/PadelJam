/**
 * Text — the only sanctioned way to render type in this app.
 *
 * Mobile currently sets `fontSize` 613 times across 17 distinct sizes, and
 * `fontWeight` 419 times. Two of the three most common sizes (15 and 13) are not
 * on any scale — they sit exactly between Tailwind steps. This component exists
 * so an 18th size cannot appear: there is deliberately NO `size` or `fontSize`
 * prop. Pick the ROLE and the scale follows.
 *
 * If a design seems to need a size that is not here, the answer is a new role in
 * `apps/mobile/theme`, agreed once, not a one-off number at the call site.
 */
import { StyleSheet, type TextProps as RNTextProps } from 'react-native';
import { Text as RNText } from './native';

import { colors, palette, type } from '../../theme';

/** Type roles, from the shared scale. `title` here is `text-2xl` on web. */
export type TextVariant = keyof typeof type;

/**
 * Semantic colour, not a hue. `inverse` is for text sitting on a filled
 * surface (a primary button, a dark card) — it is NOT "white".
 *
 * `cardForeground` and `soft` are the welcome slides' title and body colours
 * (purple-900 and slate-500). Neither is one of the tones above: `muted` is
 * slate-700 and `subtle` slate-400, and the design sits between them.
 */
export type TextTone =
  | 'default'
  | 'muted'
  | 'soft'
  | 'subtle'
  | 'inverse'
  | 'primary'
  | 'destructive'
  | 'success'
  | 'cardForeground';

type Props = Omit<RNTextProps, 'style'> & {
  variant?: TextVariant;
  tone?: TextTone;
  /**
   * Escape hatch for LAYOUT only — margins, alignment, flex.
   * Colour and type come from `variant`/`tone`; passing them here defeats the
   * point of the component and will be caught in review.
   */
  style?: RNTextProps['style'];
  children?: React.ReactNode;
};

const tones: Record<TextTone, string> = {
  default: colors.foreground,
  muted: colors.mutedForeground,
  // slate-500, straight from the ramp: `light` has no semantic token for it, and
  // adding one means a change in packages/ui that web would also have to absorb
  // (see the note in theme/index.ts on reaching for `palette`). Lives here, in
  // one line, until a second screen wants it.
  soft: palette.slate[500],
  subtle: colors.ring,
  inverse: colors.card,
  primary: colors.primary,
  destructive: colors.destructive,
  success: colors.successStrong,
  // purple-900 — the one semantic slot that holds it; the title reads as "text
  // on a card" even though the sheet's fill is `background`, not `card`.
  cardForeground: colors.cardForeground,
};

export function Text({ variant = 'body', tone = 'default', style, ...rest }: Props) {
  return <RNText style={[styles[variant], { color: tones[tone] }, style]} {...rest} />;
}

// Built from the shared scale rather than written out, so a change to the type
// ramp in packages/ui reaches mobile without anyone editing this file.
const styles = StyleSheet.create({
  display: type.display,
  title: type.title,
  heading: type.heading,
  sectionTitle: type.sectionTitle,
  body: type.body,
  bodyStrong: type.bodyStrong,
  label: type.label,
  caption: type.caption,
  hint: type.hint,
  heroTitle: type.heroTitle,
  heroBody: type.heroBody,
  buttonXs: type.buttonXs,
  button: type.button,
  buttonLg: type.buttonLg,
});
