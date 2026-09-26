/**
 * Segmented — one choice out of two to four, laid out as a single bordered bar.
 *
 * Promoted here from `components/community/SegmentedType`, which hard-coded the
 * three community types. Two other screens (`(tabs)/community/create` through
 * that component, and the live-event bottom tabs) had drawn the same bar again
 * with their own radii and font sizes.
 *
 * ACCESSIBILITY TREE IS LOAD-BEARING. Each segment stays a `button` carrying
 * `accessibilityState.selected` and its visible label, because the end-to-end
 * suites address these by label text. Do not change the role to `tab` or
 * `radio` without updating `apps/mobile/e2e/suites/09-community.e2e.ts`.
 *
 * The selected label is `default` tone, NOT white: the brand purple is light
 * enough that inverse text fails contrast on it. `Button` made the same call.
 */
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';
import { Text } from './Text';

export type SegmentedOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /**
   * Keep each label on one line, shrinking it (to 75%) rather than wrapping. For labels that carry
   * counts and can outgrow a narrow segment on a small phone (the event Player list's tabs).
   */
  singleLine?: boolean;
  /** LAYOUT only — margins and alignment. */
  style?: ViewStyle;
  testID?: string;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  singleLine = false,
  style,
  testID,
}: Props<T>) {
  return (
    <View style={[styles.row, style]} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.segment, selected && styles.segmentSelected]}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <Text
              variant="label"
              numberOfLines={singleLine ? 1 : undefined}
              adjustsFontSizeToFit={singleLine}
              minimumFontScale={singleLine ? 0.75 : undefined}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: space[3],
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  segmentSelected: { backgroundColor: colors.primary },
});
