/**
 * CodeField — the six-box one-time-code entry, for OTP sign-in, account
 * creation and recovery.
 *
 * ONE TextInput, NOT SIX. This is the whole design of the component and it is
 * not a stylistic preference:
 *
 *   - autofill. iOS `textContentType="oneTimeCode"` and Android
 *     `autoComplete="sms-otp"` deliver the WHOLE code to ONE field. Six inputs
 *     get the code dropped into the first box and nothing into the other five.
 *   - accessibility. Six inputs are six elements, each announced as an unlabelled
 *     text field. One input is one labelled field, which is also what about ten
 *     E2E suites select with `{ type: 'TextField' }`.
 *   - deletion. Backspacing across six inputs needs per-box key handling that
 *     every implementation gets subtly wrong on one platform or the other.
 *
 * So the visible boxes are painted Views with `pointerEvents: none`, and a
 * transparent, full-size TextInput sits on top of them. A tap anywhere on the
 * row lands on that input and focuses it — there is no Pressable, because the
 * input already covers the whole target.
 *
 * The error contract is `Field`'s, deliberately identical: `aria-invalid` on the
 * input, `colors.destructive` on the borders, and the message rendered below
 * through `Text` with `tone="destructive"`. `error` beats `hint` in the message
 * slot, so a validation failure can never hide behind help text.
 */
import { useState } from 'react';
import { StyleSheet, TextInput, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';
import { boxStates, sanitiseCode, type BoxState } from './codeInput';
import { Text } from './Text';

export type CodeFieldProps = {
  value: string;
  /** Always receives a SANITISED value — digits only, never longer than `length`. */
  onChangeText: (next: string) => void;
  length?: number;
  /** Rendered above the boxes AND used as the input's accessibilityLabel. */
  label?: string;
  /** Validation failure. Reddens every box and fills the message slot. */
  error?: string | null;
  /** Help text. Shown only when there is no `error`. */
  hint?: string | null;
  /** Fires as soon as the value reaches `length`, so the caller can auto-submit. */
  onComplete?: (code: string) => void;
  /**
   * Which platform autofill to ask for. 'sms' is a code that arrives by text
   * message; 'email' is one that does not, so it gets iOS's oneTimeCode (which
   * also reads codes out of Mail) but NOT Android's sms-otp, whose retriever
   * would sit there waiting for a message that never comes.
   */
  autofill?: 'sms' | 'email' | 'none';
  editable?: boolean;
  autoFocus?: boolean;
  containerStyle?: ViewStyle;
  testID?: string;
};

/** Border per box state. `invalid` wins at every index — see `codeInput.ts`. */
const BORDER: Record<BoxState, string> = {
  empty: colors.input,
  filled: colors.ring,
  active: colors.primary,
  invalid: colors.destructive,
};

export function CodeField({
  value,
  onChangeText,
  length = 6,
  label,
  error,
  hint,
  onComplete,
  autofill = 'none',
  editable = true,
  autoFocus = false,
  containerStyle,
  testID,
}: CodeFieldProps) {
  const [focused, setFocused] = useState(false);
  const invalid = Boolean(error);
  const message = error ?? hint ?? null;
  const states = boxStates(value, length, focused && editable, invalid);

  const change = (raw: string) => {
    const next = sanitiseCode(raw, length);
    onChangeText(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" tone="default" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View style={styles.boxRow}>
        {/* Painted, not interactive. `pointerEvents` sends every tap through to
            the input below, and the a11y props keep six decorative boxes out of
            the tree so the field announces itself once, by its label. */}
        <View
          style={styles.boxes}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {states.map((state, i) => (
            <View
              key={`box-${i}`}
              style={[
                styles.box,
                { borderColor: BORDER[state] },
                state === 'active' && styles.boxActive,
                !editable && styles.boxDisabled,
              ]}
            >
              {value[i] ? (
                <Text variant="title" tone={invalid ? 'destructive' : 'default'}>
                  {value[i]}
                </Text>
              ) : state === 'active' ? (
                // A visible caret in the box the next digit lands in. The real
                // caret is hidden (it would sit wherever the invisible text
                // ends, which is nowhere useful).
                <View style={styles.caret} />
              ) : null}
            </View>
          ))}
        </View>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={editable}
          autoFocus={autoFocus}
          maxLength={length}
          keyboardType="number-pad"
          // iOS reads a code out of Messages AND Mail with this; Android's
          // retriever is the autoComplete below and is SMS-only.
          textContentType={autofill === 'none' ? 'none' : 'oneTimeCode'}
          autoComplete={autofill === 'sms' ? 'sms-otp' : 'off'}
          // Invisible, but present: the text is what autofill fills and what the
          // keyboard edits — only its paint is removed.
          caretHidden
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          aria-invalid={invalid}
          testID={testID}
        />
      </View>

      {message ? (
        <Text variant="hint" tone={invalid ? 'destructive' : 'muted'} style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const BOX_HEIGHT = 56;

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
  label: { marginBottom: space[1] },
  boxRow: { alignSelf: 'stretch' },
  boxes: { flexDirection: 'row', gap: space[2] },
  box: {
    flex: 1,
    height: BOX_HEIGHT,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Thicker rather than a different colour, so the focused box still reads as
  // focused for anyone who cannot separate purple from grey.
  boxActive: { borderWidth: 2 },
  boxDisabled: { backgroundColor: colors.muted },
  caret: { width: 2, height: space[6], borderRadius: radius.sm, backgroundColor: colors.primary },
  input: {
    // Covers the whole box row, so a tap anywhere lands on the input.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // The three rules that make it invisible without making it inert.
    color: 'transparent',
    backgroundColor: 'transparent',
    // Android otherwise draws its own underline through the boxes.
    borderWidth: 0,
  },
  message: { marginTop: space[1] },
});
