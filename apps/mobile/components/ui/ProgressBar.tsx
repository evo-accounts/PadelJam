/**
 * ProgressBar — a full-width track with the percentage on its right, on the same line
 * (UX-CEVT-01). Replaces the wizard's "Step N of N" label and its dot row, which said the same
 * thing twice and could not show a path whose length changes as you answer.
 *
 * One accessibility element: the row is a `progressbar` whose value is the percentage, so a
 * screen reader hears "Progress, 40 %" once instead of a label and a stray number.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';
import { percentOf } from './progressPercent';
import { Text } from './Text';

export type ProgressBarProps = {
  /** 0..1; clamped. */
  value: number;
  /** Overrides the default "Progress" name. */
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
};

const TRACK = 6;

export function ProgressBar({ value, accessibilityLabel, style, testID }: ProgressBarProps) {
  const { t } = useT('common');
  const pct = percentOf(value);
  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? t('progress')}
      accessibilityValue={{ min: 0, max: 100, now: pct, text: `${pct}%` }}
      testID={testID}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text variant="label" tone="muted" style={styles.pct}>
        {`${pct}%`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], alignSelf: 'stretch' },
  track: {
    flex: 1,
    height: TRACK,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  fill: { height: TRACK, borderRadius: radius.full, backgroundColor: colors.primary },
  // Wide enough for "100%" so the track does not shift as the number grows.
  pct: { minWidth: space[10], textAlign: 'right', fontVariant: ['tabular-nums'] },
});
