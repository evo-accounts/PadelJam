import { useT } from '@padel/i18n';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, palette } from '../../../theme';
import { Chip, IconButton } from '../../../components/ui';

const MINUTE_OPTIONS = [0, 15, 30, 45] as const;
const DAY_COUNT = 30;

function nextWholeHour(): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DateTimePicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (iso: string) => void;
}) {
  const { t } = useT('event');

  const [working, setWorking] = useState<Date>(() => {
    if (value) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return nextWholeHour();
  });

  // Pre-fill startsAt once on mount when no value was provided.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (!value) {
      onChange(working.toISOString());
    }
  }, [value, onChange, working]);

  const commit = (next: Date) => {
    setWorking(next);
    onChange(next.toISOString());
  };

  const setDay = (target: Date) => {
    commit(
      new Date(
        target.getFullYear(),
        target.getMonth(),
        target.getDate(),
        working.getHours(),
        working.getMinutes(),
        0,
        0,
      ),
    );
  };

  const setHour = (h: number) => {
    const clamped = Math.min(23, Math.max(0, h));
    commit(
      new Date(
        working.getFullYear(),
        working.getMonth(),
        working.getDate(),
        clamped,
        working.getMinutes(),
        0,
        0,
      ),
    );
  };

  const setMinute = (min: number) => {
    commit(
      new Date(
        working.getFullYear(),
        working.getMonth(),
        working.getDate(),
        working.getHours(),
        min,
        0,
        0,
      ),
    );
  };

  const today = new Date();
  const days: Date[] = [];
  for (let i = 0; i < DAY_COUNT; i += 1) {
    days.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 0, 0, 0, 0));
  }

  const atMinHour = working.getHours() <= 0;
  const atMaxHour = working.getHours() >= 23;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('dateLabel')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayRow}
      >
        {days.map((day) => {
          const selected = sameDay(day, working);
          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => setDay(day)}
              style={[styles.dayChip, selected && styles.dayChipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.dayWeekday, selected && styles.dayTextSelected]}>
                {day.toLocaleDateString('en', { weekday: 'short' })}
              </Text>
              <Text style={[styles.dayNumber, selected && styles.dayTextSelected]}>
                {day.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>{t('timeLabel')}</Text>
      <View style={styles.timeRow}>
        <IconButton
          icon="−"
          accessibilityLabel={t('hourDecreaseLabel')}
          size="lg"
          filled
          disabled={atMinHour}
          onPress={() => setHour(working.getHours() - 1)}
        />
        <Text style={styles.hourValue}>{String(working.getHours()).padStart(2, '0')}</Text>
        <IconButton
          icon="+"
          accessibilityLabel={t('hourIncreaseLabel')}
          size="lg"
          filled
          disabled={atMaxHour}
          onPress={() => setHour(working.getHours() + 1)}
        />

        <View style={styles.minuteRow}>
          {MINUTE_OPTIONS.map((min) => {
            const selected = working.getMinutes() === min;
            return (
              <Chip
                key={min}
                label={String(min).padStart(2, '0')}
                selected={selected}
                onPress={() => setMinute(min)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  label: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  dayRow: { gap: 8, paddingVertical: 2 },
  dayChip: {
    width: 56,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    gap: 2,
  },
  dayChipSelected: { borderColor: colors.primary, backgroundColor: palette.purple[100] },
  dayWeekday: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground },
  dayNumber: { fontSize: 18, fontWeight: '700', color: colors.foreground },
  dayTextSelected: { color: colors.primary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  hourValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
    minWidth: 36,
    textAlign: 'center',
  },
  minuteRow: { flexDirection: 'row', gap: 8, marginLeft: 4 },
});
