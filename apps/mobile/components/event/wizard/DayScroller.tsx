import { useT } from '@padel/i18n';
import { dayStrip, sameDay } from '@padel/utils';
import { Fragment, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, palette, radius, space } from '../../../theme';
import { Text } from '../../ui';

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The Date card's day row (UX-CEVT-08): a horizontal scroller of the next 60 days. The month's
 * abbreviation sits inline in the row where the scroll crosses into another month (and before the
 * first day), so a day in another month can be told apart. Weekday and month follow the app's
 * language — this row used to hard-code English.
 *
 * Each day is a button named by its full date ("Saturday, 3 October"); the inline month label is
 * decorative, because every day's name already carries its month. testIDs are `date-day-YYYY-MM-DD`.
 */
export function DayScroller({
  value,
  onChange,
  today,
}: {
  value: Date | null;
  onChange: (day: Date) => void;
  /** The first day shown. */
  today: Date;
}) {
  const { i18n } = useT('event');
  const locale = i18n.language;
  const days = useMemo(() => dayStrip(today), [today]);
  const scroller = useRef<ScrollView>(null);
  const scrolled = useRef(false);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {days.map(({ date, showMonth }) => {
        const selected = value != null && sameDay(date, value);
        return (
          <Fragment key={dayKey(date)}>
            {showMonth ? (
              <View style={styles.month} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Text variant="label" tone="primary">
                  {date.toLocaleDateString(locale, { month: 'short' }).replace('.', '').toUpperCase()}
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => onChange(date)}
              // Brings a day picked earlier (coming back to the step) into view once.
              onLayout={
                selected
                  ? (e) => {
                      if (scrolled.current) return;
                      scrolled.current = true;
                      const x = e.nativeEvent.layout.x - space[16];
                      if (x > 0) scroller.current?.scrollTo({ x, animated: false });
                    }
                  : undefined
              }
              style={[styles.day, selected && styles.daySelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              testID={`date-day-${dayKey(date)}`}
            >
              <Text variant="hint" tone={selected ? 'primary' : 'muted'}>
                {date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '')}
              </Text>
              <Text variant="heading" tone={selected ? 'primary' : 'default'}>
                {date.getDate()}
              </Text>
            </Pressable>
          </Fragment>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space[2], paddingVertical: space[1], alignItems: 'center' },
  month: { justifyContent: 'center', paddingHorizontal: space[1] },
  day: {
    width: space[12] + space[2],
    paddingVertical: space[2],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    gap: space[1],
  },
  daySelected: { borderColor: colors.primary, backgroundColor: palette.purple[100] },
});
