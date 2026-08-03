/**
 * Chip — a PRESSABLE filter or choice. The counterpart to {@link Badge}.
 *
 * Selection is communicated three ways on purpose: fill, border, and
 * `accessibilityState.selected`. Colour alone fails for a colourblind user and
 * is invisible to the E2E harness, which reads the accessibility tree rather
 * than pixels.
 */
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { radius, space, type ThemeColors, useThemedStyles } from '../../theme';
import { Text } from './Text';

type Props = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
};

export function Chip({ label, selected = false, disabled = false, onPress, style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.base,
        selected ? styles.selected : styles.unselected,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text variant="label" tone={selected ? 'default' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  base: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: space[3],
  },
  selected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  unselected: {
    backgroundColor: c.card,
    borderColor: c.border,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});
