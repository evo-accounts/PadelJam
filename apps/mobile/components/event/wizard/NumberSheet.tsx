import { parseWholeInRange } from '@padel/utils';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, space, type } from '../../../theme';
import { BottomSheet, Button, Text } from '../../ui';

/**
 * A "Custom" value typed into a bottom sheet (UX-GLOB-02): a centred numeric input with the number
 * pad and Save above the keyboard. The same pattern as Scoring's custom points (UX-CEVT-05), used
 * by the Date step's custom duration (UX-CEVT-08). Validated on Save, never a disabled button
 * (UX-GLOB-06).
 */
export function NumberSheet({
  visible,
  title,
  hint,
  error,
  saveLabel,
  min,
  max,
  initial,
  onClose,
  onSave,
  testID,
}: {
  visible: boolean;
  title: string;
  hint: string;
  error: string;
  saveLabel: string;
  min: number;
  max: number;
  /** Pre-fills the input when the sheet opens; null leaves it empty. */
  initial: number | null;
  onClose: () => void;
  onSave: (n: number) => void;
  /** Prefix: the sheet is `{testID}`, the input `{testID}-input`, Save `{testID}-save`. */
  testID: string;
}) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const digits = String(max).length;

  // Seeded each time it opens.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setText(initial != null ? String(initial) : '');
      setInvalid(false);
    }
  }

  const save = () => {
    const n = parseWholeInRange(text, min, max);
    if (n == null) {
      setInvalid(true);
      return;
    }
    onSave(n);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <View style={styles.body}>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v.replace(/[^0-9]/g, '').slice(0, digits));
            setInvalid(false);
          }}
          keyboardType="number-pad"
          autoFocus
          maxLength={digits}
          textAlign="center"
          style={[styles.input, invalid && styles.inputError]}
          accessibilityLabel={title}
          accessibilityHint={hint}
          testID={`${testID}-input`}
          onSubmitEditing={save}
        />
        <Text variant="caption" tone={invalid ? 'destructive' : 'muted'} style={styles.centre}>
          {invalid ? error : hint}
        </Text>
        <Button label={saveLabel} onPress={save} fullWidth testID={`${testID}-save`} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingHorizontal: space[3], paddingBottom: space[2] },
  input: {
    ...type.display,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: space[3],
    alignSelf: 'center',
    minWidth: space[16] + space[8],
  },
  inputError: { borderColor: colors.destructive },
  centre: { textAlign: 'center' },
});
