/**
 * IconButton — a pressable with no visible label.
 *
 * 31 call sites set `hitSlop` by hand, which is the tell: an icon-sized target
 * is smaller than a finger, so every one of them had to remember to enlarge it.
 * Getting that wrong is not a visual bug, it is a control the user cannot hit.
 *
 * `accessibilityLabel` is REQUIRED, not optional. A glyph like `‹` announces as
 * nothing useful — screen-reader users get "button" and no idea what it does,
 * and the E2E harness, which finds controls by label, cannot see it either.
 * Making it a required prop is the only way that stays true as call sites are
 * added.
 */
import { Pressable, StyleSheet, type PressableProps, type ViewStyle } from 'react-native';

import { colors, radius } from '../../theme';
import { Text } from './Text';

export type IconButtonSize = 'sm' | 'md' | 'lg';

type Props = Omit<PressableProps, 'style' | 'children' | 'accessibilityLabel'> & {
  /** The glyph or short symbol to render. */
  icon: string;
  /** REQUIRED — what the control DOES, e.g. "Back", not "chevron". */
  accessibilityLabel: string;
  size?: IconButtonSize;
  /** Adds a subtle circular surface. Off by default: most are bare glyphs. */
  filled?: boolean;
  style?: ViewStyle;
};

const sizes: Record<IconButtonSize, { box: number; glyph: number; slop: number }> = {
  // `slop` tops each box up to the 44pt iOS minimum, so the visual size and the
  // TOUCHABLE size are decoupled — which is the whole point of the component.
  sm: { box: 28, glyph: 18, slop: 8 },
  md: { box: 36, glyph: 22, slop: 4 },
  lg: { box: 44, glyph: 28, slop: 0 },
};

export function IconButton({
  icon,
  accessibilityLabel,
  size = 'md',
  filled = false,
  disabled = false,
  style,
  ...rest
}: Props) {
  const s = sizes[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={s.slop}
      style={({ pressed }) => [
        styles.base,
        { width: s.box, height: s.box },
        filled && styles.filled,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      <Text
        variant="body"
        tone="default"
        style={{ fontSize: s.glyph, lineHeight: s.glyph + 2 }}
      >
        {icon}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  filled: { backgroundColor: colors.muted, borderRadius: radius.full },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
});
