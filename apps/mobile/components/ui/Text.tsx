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
import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';

import { type, type ThemeColors, useThemedStyles } from '../../theme';

/** Type roles, from the shared scale. `title` here is `text-2xl` on web. */
export type TextVariant = keyof typeof type;

/**
 * Semantic colour, not a hue. `inverse` is for text sitting on a filled
 * surface (a primary button, a dark card) — it is NOT "white".
 */
export type TextTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'inverse'
  | 'primary'
  | 'destructive'
  | 'success';

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

/**
 * A lookup table, not a stylesheet — and the same import-time problem, so it
 * goes through the same hook. `useThemedStyles` is generic over the factory's
 * return type precisely so a table like this does not need a second mechanism.
 */
const makeTones = (c: ThemeColors): Record<TextTone, string> => ({
  default: c.foreground,
  muted: c.mutedForeground,
  subtle: c.ring,
  inverse: c.card,
  primary: c.primary,
  destructive: c.destructive,
  success: c.successStrong,
});

export function Text({ variant = 'body', tone = 'default', style, ...rest }: Props) {
  const tones = useThemedStyles(makeTones);
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
});
