/**
 * Checkbox — the terms tick on create-account, and anything else that needs an
 * explicit opt-in.
 *
 * Modelled on the square that screen hand-rolled (22pt, rounded, fills with
 * primary and shows a tick) but built on tokens, and with the two things the
 * hand-rolled version could not carry: an `error` slot, so a form that refuses
 * to submit because the box is unticked can SAY so instead of only reddening
 * nothing, and a tap target that reaches the 44pt guideline via `hitSlop`
 * rather than by growing the square.
 *
 * `children` exists for the terms case specifically: that label is a sentence
 * with two tappable links inside it, which a plain `label` string cannot carry.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';
import { Text } from './Text';

export type CheckboxProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  /** Rich label — a sentence with inline links. Takes precedence over `label`. */
  children?: ReactNode;
  error?: string | null;
  /** Needed when `children` carry the label, since the row has no plain text to borrow. */
  accessibilityLabel?: string;
  testID?: string;
  style?: ViewStyle;
};

const BOX = 22;

export function Checkbox({
  checked,
  onChange,
  label,
  children,
  error,
  accessibilityLabel,
  testID,
  style,
}: CheckboxProps) {
  const invalid = Boolean(error);

  return (
    <View style={style}>
      <Pressable
        style={styles.row}
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        // What assistive tech and the E2E harness read to know the box is
        // ticked — the purple fill alone conveys nothing to either.
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel ?? label}
        hitSlop={space[3]}
        testID={testID}
      >
        <View style={[styles.box, checked && styles.boxChecked, invalid && styles.boxInvalid]}>
          {checked ? (
            // `default`, not `inverse`: the primary purple is light enough that
            // the dark foreground is what reads on it — the same call Button's
            // primary variant makes.
            <Text variant="label" tone="default">
              ✓
            </Text>
          ) : null}
        </View>
        {children ?? (label ? <Text variant="body" style={styles.label}>{label}</Text> : null)}
      </Pressable>

      {error ? (
        <Text variant="hint" tone="destructive" style={styles.message}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxInvalid: { borderColor: colors.destructive },
  label: { flex: 1 },
  message: { marginTop: space[1] },
});
