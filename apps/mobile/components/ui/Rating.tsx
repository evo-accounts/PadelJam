/**
 * Rating — five stars, read-only or tappable.
 *
 * Moved here from `components/community/StarRating`. It was never
 * community-specific: UX-COMM-13 puts the same control on the reviews list, the
 * review composer and the About tab, and players will want it next.
 *
 * `size` is a role rather than a number for the same reason `Text` has no
 * `fontSize` prop — the three call sites had picked 16, 24 and 36 independently.
 * A glyph size is not on the type scale (it is a box, not a line of prose), so
 * the three values live here, once, the way `IconButton` holds its own.
 */
import { Pressable, StyleSheet, Text as RNText, View, type ViewStyle } from 'react-native';

import { palette } from '../../theme';

const FILLED = '★';
const EMPTY = '☆';
const STARS = [1, 2, 3, 4, 5] as const;

export type RatingSize = 'sm' | 'md' | 'lg';

/** Glyph box sizes, with the line height that keeps a star vertically centred. */
const sizes: Record<RatingSize, { glyph: number; lineHeight: number }> = {
  sm: { glyph: 16, lineHeight: 20 },
  md: { glyph: 24, lineHeight: 30 },
  lg: { glyph: 36, lineHeight: 44 },
};

export type RatingProps = {
  /** 0–5. Displayed rounded to whole stars; there is no half-star glyph. */
  value: number;
  /** Supplying this makes the stars tappable. */
  onChange?: (rating: number) => void;
  size?: RatingSize;
  /** LAYOUT only — margins and alignment. */
  style?: ViewStyle;
  testID?: string;
};

export function Rating({ value, onChange, size = 'md', style, testID }: RatingProps) {
  const s = sizes[size];
  const interactive = !!onChange;

  return (
    <View
      style={[styles.row, style]}
      testID={testID}
      accessibilityRole={interactive ? 'adjustable' : 'none'}
    >
      {STARS.map((star) => {
        const filled = star <= Math.round(value);
        const glyph = (
          <RNText
            style={[
              styles.star,
              {
                fontSize: s.glyph,
                lineHeight: s.lineHeight,
                color: filled ? palette.yellow[500] : palette.slate[300],
              },
            ]}
          >
            {filled ? FILLED : EMPTY}
          </RNText>
        );

        if (!interactive) return <View key={star}>{glyph}</View>;

        return (
          <Pressable
            key={star}
            onPress={() => onChange?.(star)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={String(star)}
            testID={testID ? `${testID}-${star}` : undefined}
          >
            {glyph}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  // The glyph is a box, not prose: `Text` has no variant this maps onto, so the
  // size arrives from `sizes` above and this is deliberately RN's Text.
  star: { includeFontPadding: false },
});
