/**
 * A date row that opens the platform picker — for UX-SET-02's date of birth.
 *
 * There was no date input in the app worth reusing. `profile/edit.tsx` asked for a typed
 * `YYYY-MM-DD` and validated it with a regex, and the only date UI anywhere, the event wizard's
 * day picker, is a rolling FORWARD strip of days — correct for scheduling a match, structurally
 * incapable of expressing a birthday.
 *
 * Hence the native module. `maximumDate` is today, because a date of birth cannot be in the
 * future, and that is a constraint worth enforcing in the control rather than in a validator the
 * user meets only after tapping Save.
 *
 * On iOS the picker goes in a BottomSheet rather than inline. Two reasons: UX-GLOB-02 makes every
 * selector a sheet, and inline it renders INSIDE the scroll view — on Account Settings, whose Save
 * button is pinned to the bottom, the wheels came up half-hidden behind it. Android keeps its own
 * platform modal, which dismisses itself, so there the `set`/`dismissed` event is what closes it.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, space } from '../../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Text } from './Text';

export function DateField({
  label,
  value,
  onChange,
  placeholder,
  confirmLabel,
  displayValue,
  minimumDate,
  maximumDate = 'today',
  testID,
}: {
  label: string;
  /** `YYYY-MM-DD`, the shape `profiles.date_of_birth` stores. */
  value: string | null;
  onChange: (next: string) => void;
  placeholder: string;
  /** Copy for the iOS sheet's commit button. */
  confirmLabel: string;
  /** How the chosen day reads in the row (e.g. a localized date). Defaults to the raw value. */
  displayValue?: string;
  /** The earliest pickable day, if any (Explore's date filter: today). */
  minimumDate?: Date;
  /**
   * The latest pickable day. 'today' (the default) suits a date of birth; `null` is no limit, for
   * a date in the future (Explore's date filter).
   */
  maximumDate?: Date | 'today' | null;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date | null>(null);
  // Parsed as UTC noon rather than midnight: a midnight local date one timezone west of UTC is
  // the previous day once serialised back, which silently shifts a birthday by a day.
  const max = maximumDate === 'today' ? new Date() : (maximumDate ?? undefined);
  // A birthday picker opens on 1990; a forward-looking one on its first pickable day.
  const fallback = maximumDate === 'today' ? new Date(1990, 0, 1) : (minimumDate ?? new Date());
  const asDate = value ? new Date(`${value}T12:00:00`) : fallback;
  const shown = value ? (displayValue ?? value) : placeholder;

  return (
    <View style={styles.container}>
      <Text variant="label">{label}</Text>
      <Pressable
        style={styles.row}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown }}
        testID={testID}
      >
        <Text variant="body" tone={value ? 'default' : 'muted'}>
          {shown}
        </Text>
      </Pressable>

      {open && Platform.OS !== 'ios' ? (
        <DateTimePicker
          value={asDate}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          maximumDate={max}
          onChange={(event, next) => {
            setOpen(false);
            if (event.type === 'dismissed' || !next) return;
            onChange(serialise(next));
          }}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <BottomSheet visible={open} onClose={() => setOpen(false)} title={label} testID={`${testID ?? 'date'}-sheet`}>
          <DateTimePicker
            value={draft ?? asDate}
            mode="date"
            display="spinner"
            minimumDate={minimumDate}
            maximumDate={max}
            // The spinner reports every tick. Committing on each one would fire a write per flick
            // of the wheel, so it is held here and committed by Done.
            onChange={(_event, next) => next && setDraft(next)}
          />
          <Button
            fullWidth
            label={confirmLabel}
            testID={`${testID ?? 'date'}-confirm`}
            onPress={() => {
              onChange(serialise(draft ?? asDate));
              setDraft(null);
              setOpen(false);
            }}
          />
        </BottomSheet>
      ) : null}

    </View>
  );
}

/**
 * Local parts, never `toISOString()`: that converts to UTC first and lands on the day BEFORE for
 * anyone west of Greenwich, which silently shifts a birthday.
 */
function serialise(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
});
