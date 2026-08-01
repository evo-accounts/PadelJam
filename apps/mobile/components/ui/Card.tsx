/**
 * Card — a bordered surface. `card:` appears 21 times plus 31 `card*` keys.
 *
 * NOTE FOR THE SCREENSHOT REVIEW: this is where the border change is most
 * visible. The canonical `--border` is markedly lighter than the hairline
 * mobile uses today, so card edges will look flatter than they do now. That
 * follows from the strict-canon decision — if it reads as washed out on device,
 * this is the component to look at first. See `apps/mobile/theme/color-map.ts`
 * for the before/after values.
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
