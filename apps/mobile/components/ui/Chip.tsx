/**
 * Chip — a PRESSABLE filter or choice. The counterpart to {@link Badge}.
 *
 * Selection is communicated three ways on purpose: fill, border, and
 * `accessibilityState.selected`. Colour alone fails for a colourblind user and
 * is invisible to the E2E harness, which reads the accessibility tree rather
 * than pixels.
 */
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';
import { Text } from './Text';

type Props = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  /**
   * Renders a decorative "✕" after the label and takes over the accessibility
   * label, for a chip whose whole job is to remove the thing it names
   * (UX-COMM-22's selected people).
   *
   * It exists because the alternative was baking the glyph into `label`, which
   * `manage/invite.tsx` did: VoiceOver then announced "João Pereira ✕" as the
   * person's name, and the chip gave no hint that pressing it removed them.
   * Pass the phrasing, e.g. t('removeSelected', { name }).
   */
  removeLabel?: string;
  style?: ViewStyle;
  testID?: string;
};

export function Chip({ label, selected = false, disabled = false, onPress, removeLabel, style, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={removeLabel ?? label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.base,
        selected ? styles.selected : styles.unselected,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {/*
        One Text node, so the glyph cannot be read as a separate element — the
        Pressable's accessibilityLabel above already says what pressing it does.
      */}
      <Text variant="label" tone={selected ? 'default' : 'muted'}>
        {removeLabel ? `${label}  ✕` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: space[3],
  },
  selected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unselected: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});
