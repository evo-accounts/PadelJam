/**
 * A date row that opens the platform picker — for UX-SET-02's date of birth.
 *
 * There was no date input in the app worth reusing. `profile/edit.tsx` asked for a typed
 * `YYYY-MM-DD` and validated it with a regex, and the only date UI anywhere,
 * `components/event/wizard/DateTimePicker.tsx`, is a rolling 30-day-FORWARD chip strip — correct
 * for scheduling a match, structurally incapable of expressing a birthday.
 *
 * Hence the native module. `maximumDate` is today, because a date of birth cannot be in the
 * future, and that is a constraint worth enforcing in the control rather than in a validator the
 * user meets only after tapping Save.
 *
 * iOS renders the picker inline once shown; Android shows its own modal and dismisses itself, so
 * the `set`/`dismissed` event type is what closes it there.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, space } from '../../theme';
import { Text } from './Text';

export function DateField({
  label,
  value,
  onChange,
  placeholder,
  testID,
}: {
  label: string;
  /** `YYYY-MM-DD`, the shape `profiles.date_of_birth` stores. */
  value: string | null;
  onChange: (next: string) => void;
  placeholder: string;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  // Parsed as UTC noon rather than midnight: a midnight local date one timezone west of UTC is
  // the previous day once serialised back, which silently shifts a birthday by a day.
  const asDate = value ? new Date(`${value}T12:00:00`) : new Date(1990, 0, 1);

  return (
    <View style={styles.container}>
      <Text variant="label">{label}</Text>
      <Pressable
        style={styles.row}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value ?? placeholder }}
        testID={testID}
      >
        <Text variant="body" tone={value ? 'default' : 'muted'}>
          {value ?? placeholder}
        </Text>
      </Pressable>

      {open ? (
        <DateTimePicker
          value={asDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={(event, next) => {
            if (Platform.OS !== 'ios') setOpen(false);
            if (event.type === 'dismissed' || !next) return;
            // Local parts, not toISOString(): the latter converts to UTC first and lands on the
            // day before for anyone west of Greenwich.
            const y = next.getFullYear();
            const m = String(next.getMonth() + 1).padStart(2, '0');
            const d = String(next.getDate()).padStart(2, '0');
            onChange(`${y}-${m}-${d}`);
          }}
        />
      ) : null}

      {open && Platform.OS === 'ios' ? (
        <Pressable onPress={() => setOpen(false)} accessibilityRole="button" style={styles.done}>
          <Text variant="label" tone="primary">
            OK
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch', gap: space[1] },
  row: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    backgroundColor: colors.card,
  },
  done: { alignSelf: 'flex-end', paddingVertical: space[2], paddingHorizontal: space[3] },
});
