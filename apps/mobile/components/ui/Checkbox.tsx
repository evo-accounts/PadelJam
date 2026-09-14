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
 * THE LABEL IS A PLAIN STRING, AND THAT IS THE POINT.
 *
 * This used to take `children` so create-account could pass its consent
 * sentence — which contains the Terms of Use and Privacy Policy links — as the
 * label. iOS aggregates a Pressable and everything under it into ONE
 * accessibility element, so both links disappeared from the tree: a VoiceOver
 * user was asked to accept two documents they had no way to open. (The same
 * shape bit the E2E from the other side — the links still took RAW touches, so
 * a tap at the row's centre opened Safari instead of ticking the box.) The slot
 * is gone. Anything tappable belongs BESIDE the box as a sibling, which is what
 * the consent row in `app/(auth)/create-account.tsx` does now.
 *
 * WHAT `testID` NAMES, honestly: the Pressable. With no `label` that IS the
 * square and nothing else — create-account's case, so `tap({id})` lands on the
 * box. With a `label` it is the square plus that string, which is one
 * legitimate accessibility element and has nothing tappable inside it either
 * way. The id deliberately stays on the Pressable rather than moving to the
 * inner square: the Pressable is what carries `accessibilityRole` and
 * `accessibilityState`, so an id anywhere else would resolve to an element with
 * no checked state for assistive tech or the E2E harness to read. Earlier notes
 * here, on create-account and in the E2E driver read as though the id gave the
 * square a handle of its own; it never did, and with the sentence moved out it
 * no longer needs one.
 */
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';
import { Text } from './Text';

export type CheckboxProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  error?: string | null;
  /** Needed when the box carries no `label` — it has no text to borrow a name from. */
  accessibilityLabel?: string;
  testID?: string;
  style?: ViewStyle;
};

const BOX = 22;
/**
 * The iOS minimum touch target. The square stays 22pt because that is the
 * design; the Pressable makes up the difference with `hitSlop` instead of
 * growing, which would push the label off the type grid. DERIVED rather than
 * written as 11, so shrinking `BOX` cannot silently drop the target below 44.
 */
const MIN_TOUCH = 44;
const HIT_SLOP = Math.ceil((MIN_TOUCH - BOX) / 2);

export function Checkbox({
  checked,
  onChange,
  label,
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
        hitSlop={HIT_SLOP}
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
        {label ? <Text variant="body" style={styles.label}>{label}</Text> : null}
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
