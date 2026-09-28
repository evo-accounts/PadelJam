/**
 * Donut — a ring filled to `value / total`, with the ratio in its centre (UX-MEVT-03: the Manage
 * Event dashboard's Confirmed and Paid cards). Drawn with react-native-svg: a muted track circle
 * and a primary arc starting at 12 o'clock.
 *
 * ONE accessibility element, like ProgressBar: a `progressbar` named by `accessibilityLabel` and
 * valued with the ratio ("3/8"), so a screen reader never hears two stray numbers. Inside a
 * pressable card pass `decorative` and put the label on the card instead: iOS flattens a button's
 * children, and a non-button accessible View nested in it is noise (see InfoNote).
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '../../theme';
import { donutArc } from './donutArc';
import { Text } from './Text';

export type DonutProps = {
  value: number;
  total: number;
  /** Names the chart ("Confirmed", "Paid"). */
  accessibilityLabel: string;
  /** Spoken value; defaults to "value / total". */
  accessibilityValueText?: string;
  /** Outer diameter in points. */
  size?: number;
  /** Not an accessibility element: the surrounding control announces the ratio. */
  decorative?: boolean;
  style?: ViewStyle;
  testID?: string;
};

const STROKE_RATIO = 0.14;

export function Donut({
  value,
  total,
  accessibilityLabel,
  accessibilityValueText,
  size = 72,
  decorative = false,
  style,
  testID,
}: DonutProps) {
  const stroke = Math.max(4, Math.round(size * STROKE_RATIO));
  const arc = donutArc(value, total, size, stroke);
  const c = size / 2;
  const ratio = `${value}/${total}`;
  return (
    <View
      style={[styles.box, { width: size, height: size }, style]}
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      accessibilityRole={decorative ? undefined : 'progressbar'}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessibilityValue={
        decorative
          ? undefined
          : { min: 0, max: Math.max(total, 0), now: Math.min(value, Math.max(total, 0)), text: accessibilityValueText ?? ratio }
      }
      testID={testID}
    >
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={arc.r} stroke={colors.muted} strokeWidth={stroke} fill="none" />
        {arc.fraction > 0 ? (
          <Circle
            cx={c}
            cy={c}
            r={arc.r}
            stroke={colors.primary}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap={arc.fraction < 1 ? 'round' : 'butt'}
            strokeDasharray={`${arc.circumference} ${arc.circumference}`}
            strokeDashoffset={arc.dashOffset}
            // Start at 12 o'clock rather than 3.
            transform={`rotate(-90 ${c} ${c})`}
          />
        ) : null}
      </Svg>
      <View style={styles.centre} pointerEvents="none">
        <Text variant="bodyStrong" style={styles.ratio}>
          {ratio}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  centre: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  ratio: { fontVariant: ['tabular-nums'] },
});
