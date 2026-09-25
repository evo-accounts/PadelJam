/**
 * Dots — the page indicator under a carousel. Two hand-rolled copies existed
 * (welcome.tsx, and the event wizard's old StepIndicator, since replaced by
 * ProgressBar — UX-CEVT-01), differing in dot size, gap and inactive colour.
 *
 * The accessibility shape is the point of having one: a row of coloured circles
 * is meaningless to a screen reader, and six or eight of them are six or eight
 * elements to swipe past. So the ROW carries the name ("Page 2 of 3") and the
 * individual dots are hidden.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';

export type DotsProps = {
  count: number;
  /** Zero-based. */
  index: number;
  /** Overrides the default "Page N of M" — pass what the dots actually mean. */
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
};

const DOT = 8;

export function Dots({ count, index, accessibilityLabel, style, testID }: DotsProps) {
  const { t } = useT('common');
  if (count <= 0) return null;

  const current = Math.min(Math.max(index, 0), count - 1);

  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityLabel={accessibilityLabel ?? t('pageProgress', { current: current + 1, total: count })}
      testID={testID}
    >
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={`dot-${i}`}
          style={[styles.dot, i === current ? styles.dotActive : styles.dotInactive]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  dot: { width: DOT, height: DOT, borderRadius: radius.full },
  dotActive: { backgroundColor: colors.primary },
  dotInactive: { backgroundColor: colors.ring },
});
