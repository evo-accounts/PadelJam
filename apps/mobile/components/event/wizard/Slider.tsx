import { useState } from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from 'react-native';

import { colors, radius, space } from '../../../theme';
import { minutesAt } from './scoring';

/**
 * A whole-number slider for the Time scoring card (UX-CEVT-05: 1–90 minutes, default 10).
 *
 * Hand-built on the responder system rather than `@react-native-community/slider`: that package is a
 * native module, so adding it means a new binary for every installed build, and this is the only
 * slider in the app. Touch anywhere on the track to jump, drag to adjust.
 *
 * Accessible as an `adjustable` element: VoiceOver's swipe up / down steps the value by one,
 * and the value is read out in the caller's own words (`valueText`).
 */
export function Slider({
  value,
  min,
  max,
  onChange,
  accessibilityLabel,
  valueText,
  testID,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  accessibilityLabel: string;
  valueText: string;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  // The track's left edge in window coordinates, taken from the first touch (pageX − locationX)
  // so a drag can be followed even after the finger leaves the track vertically.
  const [originX, setOriginX] = useState(0);

  const emit = (x: number) => {
    if (width > 0) onChange(minutesAt(x / width, min, max));
  };

  // Plain responder props rather than PanResponder: no refs, and every handler sees this
  // render's width, bounds and callback.
  const responder = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    // Keep the drag once it starts, so the wizard's ScrollView cannot take it over.
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { pageX, locationX } = e.nativeEvent;
      setOriginX(pageX - locationX);
      emit(locationX);
    },
    onResponderMove: (e: GestureResponderEvent) => emit(e.nativeEvent.pageX - originX),
  };

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const clamped = Math.min(max, Math.max(min, value));
  const fraction = max > min ? (clamped - min) / (max - min) : 0;

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, clamped + 1));
    if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, clamped - 1));
  };

  return (
    <View
      style={styles.hitArea}
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: clamped, text: valueText }}
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
  );
}

const THUMB = 28;
const TRACK = 6;

const styles = StyleSheet.create({
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
