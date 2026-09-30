/**
 * The stepped distance control of Explore's Filter sheet (UX-EXPL-08, D13): 5 / 10 / 25 / 50 /
 * 100 km and a last stop with no limit, labelled "Up to N km". Plain JS — a track, a thumb and a
 * responder — so it needs no native slider dependency and no new EAS build.
 *
 * Tap a stop or drag along the track; the nearest stop wins. Every child ignores touches, so the
 * responder's `locationX` is always measured on the track itself. To VoiceOver it is one ADJUSTABLE
 * element (swipe up/down to step), with the label as its value. Disabled, with a hint, when the
 * viewer's profile has no point: every row would be dropped (D2).
 */
import { SEARCH_DISTANCE_STEPS_KM as STEPS } from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius, space } from '../../../theme';
import { DISTANCE_STOPS, kmAt, stopAt, stopOf, THUMB } from './distanceSteps';

const STOPS = DISTANCE_STOPS;

export function DistanceSlider({
  value,
  onChange,
  disabled,
  testID,
}: {
  value: number | null;
  onChange: (km: number | null) => void;
  disabled: boolean;
  testID?: string;
}) {
  const { t } = useT('discovery');
  const [width, setWidth] = useState(0);
  const index = stopOf(value);
  const text = value == null ? t('distanceAny') : t('distanceUpTo', { km: value });
  const pick = (e: GestureResponderEvent) => {
    if (disabled || width === 0) return;
    const next = stopAt(e.nativeEvent.locationX, width);
    if (next !== index) onChange(kmAt(next));
  };
  const left = width === 0 ? 0 : (index / (STOPS - 1)) * (width - THUMB);

  return (
    <View style={styles.wrap}>
      <Text variant="body" tone={disabled ? 'muted' : 'default'}>
        {text}
      </Text>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('filterDistance')}
        accessibilityValue={{ text }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (disabled) return;
          const next = e.nativeEvent.actionName === 'increment' ? index + 1 : index - 1;
          if (next >= 0 && next < STOPS) onChange(kmAt(next));
        }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        // Hold the gesture against the sheet's vertical scroll once a drag has started here.
        onResponderTerminationRequest={() => false}
        onResponderGrant={pick}
        onResponderMove={pick}
        style={[styles.track, disabled && styles.disabled]}
        testID={testID}
      >
        <View style={styles.rail} pointerEvents="none" />
        <View style={[styles.fill, { width: left }]} pointerEvents="none" />
        {Array.from({ length: STOPS }, (_, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={[
              styles.tick,
              { left: width === 0 ? 0 : (i / (STOPS - 1)) * (width - THUMB) + THUMB / 2 - 3 },
              i <= index && styles.tickOn,
            ]}
          />
        ))}
        <View style={[styles.thumb, { left }]} pointerEvents="none" />
      </View>
      <View style={styles.labels} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {STEPS.map((km) => (
          <Text key={km} variant="hint" tone="muted">
            {km}
          </Text>
        ))}
        <Text variant="hint" tone="muted">
          {t('distanceAnyShort')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  track: { height: 44, justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  rail: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  fill: { position: 'absolute', left: THUMB / 2, height: 4, borderRadius: radius.full, backgroundColor: colors.primary },
  tick: { position: 'absolute', width: 6, height: 6, borderRadius: radius.full, backgroundColor: colors.border },
  tickOn: { backgroundColor: colors.primary },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
});
