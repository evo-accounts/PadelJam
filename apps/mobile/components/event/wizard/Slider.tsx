import { useState } from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from 'react-native';

import { colors, radius, space } from '../../../theme';
import { Text } from '../../ui';
import { minutesAt } from '@padel/utils';

const THUMB = 28;
const TRACK = 6;

/**
 * A whole-number slider for the Time scoring card (UX-CEVT-05: 1–90 minutes, default 10), with
 * its label and current value on a line above the track.
 *
 * Hand-built on the responder system rather than `@react-native-community/slider`: that package is
 * a native module, so adding it means a new binary for every installed build, and this is the only
 * slider in the app. Touch anywhere on the track to jump, drag to adjust.
 *
 * While dragging, the value lives here (and the label follows it); `onChange` fires once, on
 * release — so a drag does not re-render the whole wizard on every move.
 *
 * Accessible as an `adjustable` element: VoiceOver's swipe up / down steps the value by one
 * (committed immediately), and the value is read out as `formatValue` words it.
 */
export function Slider({
  label,
  value,
  min,
  max,
  onChange,
  formatValue,
  testID,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  formatValue: (n: number) => string;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  // The track's left edge in window coordinates, from the first touch (pageX − locationX), so a
  // drag is followed even after the finger leaves the track vertically.
  const [originX, setOriginX] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);

  // The thumb's centre travels from THUMB/2 to width − THUMB/2 (see its `left` below), so a touch
  // maps through the same span: touching the thumb never makes it jump.
  const valueAt = (x: number) =>
    minutesAt(width > THUMB ? (x - THUMB / 2) / (width - THUMB) : 0, min, max);

  const commit = () => {
    if (dragging != null && dragging !== value) onChange(dragging);
    setDragging(null);
  };

  // Plain responder props rather than PanResponder: no refs, and every handler sees this render's
  // width, bounds and callback.
  const responder = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    // Keep the drag once it starts, so the wizard's ScrollView cannot take it over.
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { pageX, locationX } = e.nativeEvent;
      setOriginX(pageX - locationX);
      setDragging(valueAt(locationX));
    },
    onResponderMove: (e: GestureResponderEvent) => setDragging(valueAt(e.nativeEvent.pageX - originX)),
    onResponderRelease: commit,
    onResponderTerminate: commit,
  };

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const shown = Math.min(max, Math.max(min, dragging ?? value));
  const fraction = max > min ? (shown - min) / (max - min) : 0;

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, shown + 1));
    if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, shown - 1));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text variant="label" tone="default">
          {label}
        </Text>
        <Text variant="bodyStrong" tone="default">
          {formatValue(shown)}
        </Text>
      </View>
      <View
        style={styles.hitArea}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: shown, text: formatValue(shown) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        testID={testID}
        {...responder}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, { left: fraction * Math.max(0, width - THUMB) }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // Taller than the track so the thumb is easy to catch.
  hitArea: { height: space[10], justifyContent: 'center' },
  track: { height: TRACK, borderRadius: radius.full, backgroundColor: colors.muted, overflow: 'hidden' },
  fill: { height: TRACK, backgroundColor: colors.primary },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
  },
});
