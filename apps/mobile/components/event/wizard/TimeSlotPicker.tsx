import { useT } from '@padel/i18n';
import { DAY_PERIODS, type DayPeriod, isPastSlot, periodOf, timeSlots } from '@padel/utils';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../../theme';
import { Chip, Segmented } from '../../ui';

const PERIOD_KEY: Record<DayPeriod, string> = {
  morning: 'periodMorning',
  afternoon: 'periodAfternoon',
  evening: 'periodEvening',
};

/**
 * The Time card (UX-CEVT-08): Morning / Afternoon / Evening tabs, each revealing its half-hourly
 * start times as a grid. Picking a time is one tap — no steppers. On today, times already gone
 * are shown but disabled. Opens on the tab holding the current start.
 *
 * testIDs: tabs `time-period-{period}`, slots `time-slot-HH:MM` (both accessible buttons).
 */
export function TimeSlotPicker({
  day,
  value,
  onChange,
  now,
}: {
  /** The picked day — decides which slots are past. */
  day: Date;
  /** 'HH:MM', or null when no time is picked. */
  value: string | null;
  onChange: (hhmm: string) => void;
  now: Date;
}) {
  const { t } = useT('event');
  const valuePeriod = value ? periodOf(value) : null;
  const [period, setPeriod] = useState<DayPeriod>(valuePeriod ?? 'evening');
  // Follow the value when it moves to another period from outside (a day change that snapped
  // the start to the first free slot); a tab the user opened stays open until then.
  const [syncedPeriod, setSyncedPeriod] = useState(valuePeriod);
  if (valuePeriod !== syncedPeriod) {
    setSyncedPeriod(valuePeriod);
    if (valuePeriod) setPeriod(valuePeriod);
  }

  return (
    <View style={styles.container}>
      <Segmented<DayPeriod>
        options={DAY_PERIODS.map((p) => ({ value: p, label: t(PERIOD_KEY[p]) }))}
        value={period}
        onChange={setPeriod}
        testID="time-period"
      />
      <View style={styles.grid}>
        {timeSlots(period).map((slot) => (
          <Chip
            key={slot}
            label={slot}
            selected={slot === value}
            disabled={isPastSlot(day, slot, now)}
            onPress={() => onChange(slot)}
            style={styles.slot}
            testID={`time-slot-${slot}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[3] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  // Four to a row on a phone; the label is centred in a fixed width so the grid lines up.
  slot: { width: '22%', alignItems: 'center' },
});
