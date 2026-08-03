/**
 * Button — replaces 278 hand-rolled pressables across 94 files.
 *
 * Those call sites spell the same thing five ways (`button:`, `btn:`, `cta:`,
 * `primaryBtn:`, `submit:`) and each re-derives its own padding, radius and
 * disabled treatment. The variants here are the ones that actually exist in the
 * app today, named for INTENT rather than colour.
 *
 * Accessibility is not optional plumbing: `accessibilityState` is what the E2E
 * harness reads to know a control is busy or disabled, and `minHeight` on every
 * size keeps the tap target at or above the 44pt iOS guideline.
 */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { radius, space, type ThemeColors, useColors, useThemedStyles } from '../../theme';
import { Text, type TextTone, type TextVariant } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks presses. Distinct from `disabled`: this is transient. */
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

/** Fill, border and label tone per variant. `ghost` and `outline` are transparent. */
const makeVariants = (
  c: ThemeColors,
): Record<ButtonVariant, { bg: string; border: string; tone: TextTone }> => ({
  primary: { bg: c.primary, border: c.primary, tone: 'default' },
  secondary: { bg: c.secondary, border: c.secondary, tone: 'default' },
  outline: { bg: 'transparent', border: c.border, tone: 'default' },
  ghost: { bg: 'transparent', border: 'transparent', tone: 'default' },
  destructive: { bg: c.destructive, border: c.destructive, tone: 'inverse' },
});

const sizes: Record<ButtonSize, { minHeight: number; px: number; text: TextVariant }> = {
  // 36 is below the 44pt guideline, so `sm` is for dense secondary actions
  // inside a row — never for a screen's main call to action.
  sm: { minHeight: 36, px: space[3], text: 'label' },
  md: { minHeight: 44, px: space[4], text: 'bodyStrong' },
  lg: { minHeight: 52, px: space[5], text: 'bodyStrong' },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  ...rest
}: Props) {
  const variants = useThemedStyles(makeVariants);
  const colors = useColors();
  const v = variants[variant];
  const s = sizes[size];
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
          minHeight: s.minHeight,
          paddingHorizontal: s.px,
          backgroundColor: v.bg,
          borderColor: v.border,
        },
        fullWidth && styles.fullWidth,
        // Dimming BOTH states through opacity keeps every variant consistent
        // without inventing a second colour per variant for each state.
        pressed && styles.pressed,
        blocked && styles.blocked,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator
            size="small"
            color={variant === 'destructive' ? colors.card : colors.foreground}
          />
          {/* The label stays mounted while loading so the button does not
              change width mid-press, and so assistive tech keeps its name. */}
          <Text variant={s.text} tone={v.tone}>
            {label}
          </Text>
        </View>
      ) : (
        <Text variant={s.text} tone={v.tone}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: 0.85 },
  blocked: { opacity: 0.45 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
