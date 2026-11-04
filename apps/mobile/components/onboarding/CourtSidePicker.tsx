/**
 * CourtSidePicker — frames 6 to 8. A court split into two tappable halves; the
 * selected half fills and the fox sits on it. The round button in the middle
 * swaps the selection.
 *
 * Accessibility: a `radiogroup` of two `radio`s, each named by its visible label
 * ("Left side" / "Right side"). The swap button is named "Switch side". The fox
 * is decorative.
 *
 * The court is drawn in perspective (an SVG layer); the halves are plain
 * rectangular `Pressable`s on top, transparent, as the hit targets.
 */
import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import Svg, { Polygon } from 'react-native-svg';

import { colors, onboardingColors, radius, space, type } from '../../theme';
import { Text as RNText } from '../ui/native';

export type CourtSide = 'left' | 'right';

const FOX = 120;
const SWAP = 44;
const COURT_H = 280;
// Court drawing in a 300 x 280 box, stretched to the width. Far edge inset by 40.
const LEFT_POLY = '40,0 150,0 150,280 0,280';
const RIGHT_POLY = '150,0 260,0 300,280 150,280';

export function CourtSidePicker({
  value,
  onChange,
  leftLabel,
  rightLabel,
  switchLabel,
  fox,
  testID,
}: {
  value: CourtSide | null;
  onChange: (side: CourtSide) => void;
  leftLabel: string;
  rightLabel: string;
  switchLabel: string;
  /** The fox illustration. Absent, the selected half is just filled. */
  fox?: ImageSourcePropType;
  testID?: string;
}) {
  const half = (side: CourtSide, label: string) => {
    const checked = value === side;
    return (
      <Pressable
        onPress={() => onChange(side)}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        style={styles.half}
        testID={testID ? `${testID}-${side}` : undefined}
      >
        {checked && fox ? (
          <View style={styles.fox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Image source={fox} style={styles.foxImage} resizeMode="contain" />
          </View>
        ) : null}
        <View style={styles.labelRow}>
          <RNText style={[type.body, checked ? styles.labelChecked : styles.label]}>{label}</RNText>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.net} />
      <View accessibilityRole="radiogroup" style={styles.court}>
        <Svg
          style={StyleSheet.absoluteFill}
          viewBox="0 0 300 280"
          preserveAspectRatio="none"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {(['left', 'right'] as const).map((side) => (
            <Polygon
              key={side}
              points={side === 'left' ? LEFT_POLY : RIGHT_POLY}
              fill={value === side ? onboardingColors.courtSelectedBg : 'none'}
              stroke={value === side ? onboardingColors.courtSelectedBorder : onboardingColors.courtLine}
              strokeWidth={value === side ? 3 : 1.5}
            />
          ))}
        </Svg>
        {half('left', leftLabel)}
        {half('right', rightLabel)}
      </View>
      {value ? (
        <Pressable
          onPress={() => onChange(value === 'left' ? 'right' : 'left')}
          accessibilityRole="button"
          accessibilityLabel={switchLabel}
          style={styles.swap}
          testID={testID ? `${testID}-swap` : undefined}
        >
          <RNText style={[type.bodyStrong, styles.swapGlyph]}>⇄</RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space[8], justifyContent: 'center' },
  net: {
    height: space[2],
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    backgroundColor: onboardingColors.courtLine,
  },
  court: {
    flexDirection: 'row',
    height: COURT_H,
  },
  half: { flex: 1, justifyContent: 'flex-end' },
  fox: { position: 'absolute', top: space[2], left: 0, right: 0, alignItems: 'center' },
  foxImage: { width: FOX, height: FOX },
  labelRow: { height: 52, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.mutedForeground },
  labelChecked: { color: onboardingColors.optionSelectedTitle },
  swap: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 52 - SWAP / 2,
    width: SWAP,
    height: SWAP,
    borderRadius: radius.lg,
    backgroundColor: onboardingColors.courtSelectedBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapGlyph: { color: onboardingColors.optionBg },
});
