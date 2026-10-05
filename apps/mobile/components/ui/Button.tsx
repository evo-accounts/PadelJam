/**
 * Button — the "Custom Button" set in the PJAM Design System Figma file.
 *
 * Colours and metrics come from `buttonTone` / `buttonSize` in `@padel/ui`,
 * the same module web's `components/ui/button.tsx` reads through generated CSS
 * variables, so the two apps cannot drift apart per variant.
 *
 * Of the file's six states, mobile renders four: enabled, active (pressed),
 * disabled and loading. Hover and focus have no touch equivalent, and the
 * invalid ring is a form-control treatment that no mobile button carries.
 *
 * Accessibility is not optional plumbing: `accessibilityState` is what the E2E
 * harness reads to know a control is busy or disabled. `xs` (24) and `sm` (32)
 * are below the 44pt iOS guideline by design — they are for dense rows on the
 * few screens that call for them, never a screen's main call to action.
 */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

// The label needs the tone's own colour, which `Text`'s semantic `tone`s
// deliberately cannot express. Role and colour both still come from tokens.
import { Text as RNText } from './native';

import {
  BUTTON_DISABLED_OPACITY,
  buttonSize,
  buttonTone,
  type ButtonSize,
  type ButtonVariant,
} from '@padel/ui';

import { type } from '../../theme';

export type { ButtonSize, ButtonVariant };

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks presses. Distinct from `disabled`: this is transient. */
  loading?: boolean;
  fullWidth?: boolean;
  /**
   * Rendered at the size's icon step (12/14/16/24) — size the glyph with
   * `buttonSize[size].icon` and colour it with `buttonTone[variant].fg`.
   */
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
};

const labelRole: Record<ButtonSize, keyof typeof type> = {
  xs: 'buttonXs',
  sm: 'button',
  md: 'button',
  lg: 'buttonLg',
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  ...rest
}: Props) {
  const tone = buttonTone[variant];
  const metrics = buttonSize[size];
  const blocked = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      style={({ pressed }) => [
        styles.base,
        {
          // `height`, not `minHeight`: the sizes are fixed in the design, and a
          // row's default `alignItems: stretch` otherwise grows an xs button to
          // the height of its tallest sibling. The label is one line, so it fits.
          height: metrics.height,
          paddingHorizontal: metrics.paddingX,
          gap: metrics.gap,
          borderRadius: metrics.radius,
          backgroundColor: pressed ? tone.bgActive : tone.bg,
        },
        fullWidth && styles.fullWidth,
        blocked && styles.blocked,
        style,
      ]}
      {...rest}
    >
      {/* The spinner takes the left icon's slot, as in the Figma component, and
          the label stays mounted so the button keeps its width and its name. */}
      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} style={styles.spinner} />
      ) : (
        leftIcon && <View style={iconBox(metrics.icon)}>{leftIcon}</View>
      )}
      <RNText style={[type[labelRole[size]], { color: tone.fg }]} numberOfLines={1}>
        {label}
      </RNText>
      {rightIcon && <View style={iconBox(metrics.icon)}>{rightIcon}</View>}
    </Pressable>
  );
}

const iconBox = (size: number): ViewStyle => ({
  width: size,
  height: size,
  alignItems: 'center',
  justifyContent: 'center',
});

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: { alignSelf: 'stretch' },
  blocked: { opacity: BUTTON_DISABLED_OPACITY },
  // iOS's "small" indicator is 20pt; Figma's spinner is 12. Scaling keeps the
  // native control rather than drawing a custom one.
  spinner: { transform: [{ scale: 0.6 }], width: 12, height: 12 },
});
