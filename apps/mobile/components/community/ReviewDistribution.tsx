/**
 * UX-COMM-13's bar chart: how many reviews gave each score.
 *
 * It answers a question the average cannot. A 3.5 made of nothing but fours and
 * threes describes a consistent club; the same 3.5 made of fives and ones
 * describes one people disagree about violently, and that is the more useful
 * thing to know before joining.
 *
 * ACCESSIBILITY: a bar is a picture of a number, and a screen reader cannot see
 * a width. Each row is therefore ONE element announcing the score and its count
 * in words — "5 stars, 12 reviews" — and the bar itself is hidden. Without that
 * grouping the chart reads as ten loose numbers in a column ("5", "12", "4",
 * "8"…) whose pairing is conveyed only by the layout.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import { reviewDistribution } from './reviewStats';
import { Text } from '../ui';
import { colors, radius, space } from '../../theme';

export function ReviewDistribution({ reviews }: { reviews: { rating: number }[] }) {
  const { t } = useT('community');
  const buckets = reviewDistribution(reviews);

  return (
    <View style={styles.chart} testID="review-distribution">
      {buckets.map((bucket) => (
        <View
          key={bucket.score}
          style={styles.row}
          accessible
          accessibilityLabel={t('reviewsDistributionRow', {
            score: bucket.score,
            count: bucket.count,
          })}
        >
          <Text variant="caption" tone="muted" style={styles.score}>
            {bucket.score}
          </Text>
          <View style={styles.track}>
            {/*
              `flex` rather than a percentage width: the track's own width is not
              known at render time (it fills whatever the card gives it), and a
              zero-count bar must still collapse completely rather than show the
              1pt sliver a min-width would leave behind.
            */}
            <View style={[styles.fill, { flex: bucket.fraction }]} />
            <View style={{ flex: 1 - bucket.fraction }} />
          </View>
          <Text variant="caption" tone="muted" style={styles.count}>
            {bucket.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  // Fixed widths so every bar starts and ends on the same two lines; without
  // them a two-digit count shortens its own track and the bars stop comparing.
  score: { width: 12, textAlign: 'right' },
  count: { width: 28, textAlign: 'right' },
  track: {
    flex: 1,
    flexDirection: 'row',
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  fill: { backgroundColor: colors.primary },
});
