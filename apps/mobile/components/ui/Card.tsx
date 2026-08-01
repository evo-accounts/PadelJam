/**
 * Card — a bordered surface. `card:` appears 21 times plus 31 `card*` keys.
 *
 * THE FAINT BORDER IS INTENTIONAL — REVIEWED AND ACCEPTED, 2026-08-01.
 *
 * The canonical `--border` is markedly lighter than the hairline mobile used
 * before, so a bordered card sits very close to its background and is hard to
 * tell from the elevated variant. That was flagged at the design-system
 * screenshot gate, with a proposal to darken the token by one step, and the
 * decision was to keep strict canon: both platforms use the same value, no
 * per-platform exceptions.
 *
 * So this is not a bug to fix in passing. If it needs revisiting, the change
 * belongs in `packages/ui` where web gets it too — not a local override here.
 */
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

type Props = {
  children?: React.ReactNode;
  padding?: CardPadding;
  /** Raised surface rather than a bordered one — for cards on a busy background. */
  elevated?: boolean;
  /** Makes the whole card a button. Adds the a11y role only when set. */
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
};

const paddings: Record<CardPadding, number> = {
  none: 0,
  sm: space[3],
  md: space[4],
  lg: space[5],
};

export function Card({
  children,
  padding = 'md',
  elevated = false,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: Props) {
  const surface = [
    styles.base,
    { padding: paddings[padding] },
    elevated ? styles.elevated : styles.bordered,
    style,
  ];

  if (!onPress) {
    return (
      <View testID={testID} style={surface} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [...surface, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
  },
  bordered: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  elevated: {
    // shadowColor takes a colour, so it comes from the token surface like
    // everything else. Opacity and radius are geometry, not palette.
    shadowColor: colors.foreground,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  pressed: { opacity: 0.9 },
});
