import { Pressable, StyleSheet, Text, View } from 'react-native';

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

type StarRatingProps = {
  value: number;
  onChange?: (rating: number) => void;
  size?: number;
};

/**
 * Star rating display / input.
 * - When `onChange` is provided the stars become interactive (1–5).
 * - Without `onChange` it renders read-only with fractional fill not supported
 *   (whole stars only, rounded).
 */
export function StarRating({ value, onChange, size = 22 }: StarRatingProps) {
  const interactive = !!onChange;

  return (
    <View style={styles.row} accessibilityRole={interactive ? 'adjustable' : 'none'}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.round(value);
        if (interactive) {
          return (
            <Pressable
              key={star}
              onPress={() => onChange?.(star)}
              hitSlop={6}
              accessibilityLabel={String(star)}
              accessibilityRole="button"
            >
              <Text style={[styles.star, { fontSize: size, color: filled ? '#F5A623' : '#C5CDD8' }]}>
                {filled ? STAR_FILLED : STAR_EMPTY}
              </Text>
            </Pressable>
          );
        }
        return (
          <Text
            key={star}
            style={[styles.star, { fontSize: size, color: filled ? '#F5A623' : '#C5CDD8' }]}
          >
            {filled ? STAR_FILLED : STAR_EMPTY}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  star: { lineHeight: 28 },
});
