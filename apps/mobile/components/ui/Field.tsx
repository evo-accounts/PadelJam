/**
 * Field — label + input + message. The most repeated COMPOSITE in the app
 * (`input:` 25, `label:` 31, `error:` 32).
 *
 * The three keys drift independently today: some screens show the error and
 * keep the border neutral, some colour the border and drop the message, some
 * reserve no space for it so the form jumps as you type. Binding them together
 * is the reason this exists.
 *
 * `error` takes precedence over `hint` in the message slot, so a validation
 * failure can never be hidden behind help text.
 */
import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, radius, space, type } from '../../theme';
import { Text } from './Text';

type Props = Omit<TextInputProps, 'style'> & {
  label?: string;
  /** Validation failure. Shown in the message slot and reddens the border. */
  error?: string | null;
  /** Help text. Shown only when there is no `error`. */
  hint?: string | null;
  required?: boolean;
  containerStyle?: ViewStyle;
};

export const Field = forwardRef<TextInput, Props>(function Field({
  label,
  error,
  hint,
  required = false,
  containerStyle,
  editable = true,
  multiline = false,
  ...rest
}, ref) {
  const invalid = Boolean(error);
  const message = error ?? hint ?? null;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" tone="default" style={styles.label}>
          {label}
          {required ? (
            // Marked up rather than concatenated so screen readers can be told
            // this is required, instead of announcing a bare asterisk.
            <Text variant="label" tone="destructive" accessibilityLabel="required">
              {' *'}
            </Text>
          ) : null}
        </Text>
      ) : null}

      <TextInput
        ref={ref}
        style={[
          styles.input,
          // A multiline field sizes and aligns itself. Call sites used to pass a
          // style for this, which meant every long-text field re-derived the
          // same two rules — and `style` is deliberately not part of this
          // component's API, because that is how inputs drift apart.
          multiline && styles.inputMultiline,
          invalid && styles.inputInvalid,
          !editable && styles.inputDisabled,
        ]}
        multiline={multiline}
        editable={editable}
        placeholderTextColor={colors.ring}
        accessibilityLabel={label}
        // What assistive tech and the E2E harness read to know the field failed
        // — the red border alone conveys nothing to either.
        accessibilityState={{ disabled: !editable }}
        aria-invalid={invalid}
        {...rest}
      />

      {message ? (
        <Text variant="hint" tone={invalid ? 'destructive' : 'muted'} style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
  label: { marginBottom: space[1] },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    backgroundColor: colors.card,
    color: colors.foreground,
    fontSize: type.body.fontSize,
  },
  inputMultiline: {
    minHeight: 100,
    paddingTop: space[3],
    // Without this, RN centres the first line vertically in a tall box on
    // Android and looks broken next to iOS.
    textAlignVertical: 'top',
  },
  inputInvalid: { borderColor: colors.destructive },
  inputDisabled: { backgroundColor: colors.muted },
  message: { marginTop: space[1] },
});
