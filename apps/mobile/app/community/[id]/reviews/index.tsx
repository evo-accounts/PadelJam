/**
 * Community reviews (UX-COMM-13).
 *
 * Three things changed from the version this replaces:
 *
 *  - A SCORE DISTRIBUTION, because the average alone hides the disagreement. A
 *    3.5 of fours and threes is a consistent club; a 3.5 of fives and ones is a
 *    contested one, and that is the more useful fact.
 *  - Sort and rating filter as BOTTOM SHEETS rather than two rows of inline
 *    chips. The chips cost two full rows above the first review and still could
 *    not show which of six ratings was active without reading colour. A
 *    dropdown states its current value in words.
 *  - TWO empty states. "No reviews yet" is a different message depending on
 *    whether the reader can do anything about it, and the old screen showed one
 *    of them to everybody with the gate explained in a separate paragraph
 *    further up.
 *
 * "Write a review" is now fixed at the bottom rather than sitting above the
 * filters, so it survives scrolling — it is the action of the screen.
 */
import { useCanReviewCommunity, useCommunityReviews } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReviewCard, type ReviewRow } from '@/components/community/ReviewCard';
import { ReviewDistribution } from '@/components/community/ReviewDistribution';
import { colors, space } from '../../../../theme';
import {
  Button,
  EmptyState,
  emptyIcon,
  ListRow,
  Loading,
  listEmptyContent,
  Rating,
  Text,
  TopBar,
  useActionSheet,
} from '../../../../components/ui';

type SortKey = 'newest' | 'highest' | 'lowest';
/** 0 = every rating. */
type RatingFilter = 0 | 1 | 2 | 3 | 4 | 5;

const SORT_KEYS: SortKey[] = ['newest', 'highest', 'lowest'];
const SORT_LABEL_KEY: Record<SortKey, string> = {
  newest: 'reviewsSortNewest',
  highest: 'reviewsSortHighest',
  lowest: 'reviewsSortLowest',
};

const RATING_VALUES: RatingFilter[] = [0, 5, 4, 3, 2, 1];

export default function ReviewsScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const showSheet = useActionSheet();

  const { data, isLoading } = useCommunityReviews(id);
  const reviews = useMemo(() => (data?.reviews ?? []) as ReviewRow[], [data?.reviews]);
  const average = data?.average ?? null;
  const count = data?.count ?? 0;

  const [sort, setSort] = useState<SortKey>('newest');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>(0);

  const myReview = reviews.find((r) => r.user_id === uid);
  const { data: canReview } = useCanReviewCommunity(id);
  /**
   * The gate is PARTICIPATION, not role (UX-COMM-13): three completed events in
   * this community, enforced by `can_review_community` since migration 0069.
   * Someone who already reviewed keeps the ability to edit regardless — they
   * cleared the gate once, and revoking the edit would strand their own words.
   * A still-loading `canReview` reads as not-yet-allowed so the action does not
   * flash in for people who will not get it.
   */
  const canWrite = (canReview ?? false) || !!myReview;

  const filtered = useMemo<ReviewRow[]>(() => {
    const list = ratingFilter === 0 ? reviews : reviews.filter((r) => r.rating === ratingFilter);
    const byNewest = (a: ReviewRow, b: ReviewRow) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    switch (sort) {
      case 'highest':
        return [...list].sort((a, b) => b.rating - a.rating || byNewest(a, b));
      case 'lowest':
        return [...list].sort((a, b) => a.rating - b.rating || byNewest(a, b));
      default:
        return [...list].sort(byNewest);
    }
  }, [reviews, sort, ratingFilter]);

  const ratingLabel = (value: RatingFilter) =>
    value === 0 ? t('reviewsFilterAll') : t('reviewsFilterScore', { count: value });

  const pickSort = async () => {
    const key = await showSheet({
      title: t('reviewsSortTitle'),
      actions: SORT_KEYS.map((k) => ({ key: k, label: t(SORT_LABEL_KEY[k]) })),
    });
    if (key) setSort(key as SortKey);
  };

  const pickRating = async () => {
    const key = await showSheet({
      title: t('reviewsFilterTitle'),
      actions: RATING_VALUES.map((v) => ({ key: String(v), label: ratingLabel(v) })),
    });
    if (key != null) setRatingFilter(Number(key) as RatingFilter);
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.summary}>
        {average != null ? (
          <>
            {/*
              One element: "4.2 out of 5, 18 reviews". Left as three siblings a
              screen reader reads a bare number, then a star rating, then
              another bare number, and has to assemble the sentence itself.
            */}
            <View
              accessible
              accessibilityLabel={t('reviewsSummaryA11y', { average: average.toFixed(1), count })}
              style={styles.summaryFigures}
            >
              <Text variant="display">{average.toFixed(1)}</Text>
              <Rating value={average} size="md" />
              <Text variant="caption" tone="muted">
                {t('reviewsCount', { count })}
              </Text>
            </View>
            <ReviewDistribution reviews={reviews} />
          </>
        ) : null}
      </View>

      {count > 0 ? (
        <View style={styles.selectors}>
          {/*
            UX-COMM-13 asks for "two dropdown selectors ... opening as bottom
            sheets rather than inline chips". A ListRow states the current value
            as its subtitle, which is what the chips could not do — with six
            rating options, the selected one was distinguishable only by colour.
          */}
          <ListRow
            title={t('reviewsSortLabel')}
            subtitle={t(SORT_LABEL_KEY[sort])}
            variant="card"
            style={styles.selector}
            onPress={() => void pickSort()}
            trailing={
              <Text variant="body" tone="muted">
                ⌄
              </Text>
            }
            testID="reviews-sort"
          />
          <ListRow
            title={t('reviewsFilterLabel')}
            subtitle={ratingLabel(ratingFilter)}
            variant="card"
            style={styles.selector}
            onPress={() => void pickRating()}
            trailing={
              <Text variant="body" tone="muted">
                ⌄
              </Text>
            }
            testID="reviews-filter"
          />
        </View>
      ) : null}
    </View>
  );

  /**
   * The two empty states of UX-COMM-13, which differ by whether the reader can
   * act. A filter that matched nothing is a third case and neither of them: the
   * community HAS reviews, so offering to write one answers a question nobody
   * asked.
   */
  const empty = () => {
    if (isLoading) return null;
    if (count > 0) {
      return (
        <EmptyState
          fill
          icon={emptyIcon('star')}
          title={t('reviewsNoMatches')}
          body={t('reviewsNoMatchesBody')}
          action={{ label: t('reviewsFilterClear'), onPress: () => setRatingFilter(0) }}
          testID="empty-reviews-filtered"
        />
      );
    }
    return canWrite ? (
      <EmptyState
        fill
        icon={emptyIcon('star')}
        title={t('noReviews')}
        body={t('reviewsEmptyBody')}
        // No action: "Write a review" is pinned at the bottom of the screen and
        // repeating it here would be the same button twice in one screenful.
        testID="empty-reviews"
      />
    ) : (
      <EmptyState
        fill
        icon={emptyIcon('star')}
        title={t('noReviews')}
        // The gate, explained where it is felt — the audit is explicit that this
        // state carries "a description explaining that 3 completed events unlock
        // reviewing" and NO action.
        body={t('reviewsGateBody')}
        testID="empty-reviews-gated"
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TopBar title={t('reviewsTitle')} onBack={() => router.back()} backLabel={t('back')} />

      {isLoading ? (
        <Loading />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ReviewCard review={item} />}
          ListHeaderComponent={header}
          contentContainerStyle={listEmptyContent}
          ListEmptyComponent={empty()}
        />
      )}

      {/* UX-COMM-13: "Write a review" FIXED at the bottom. */}
      {canWrite ? (
        <View style={styles.footer}>
          <Button
            label={myReview ? t('reviewsEditCta') : t('reviewsWriteCta')}
            fullWidth
            onPress={() => router.push(`/community/${id}/reviews/write`)}
            testID="reviews-write"
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  header: { padding: space[4], gap: space[4] },
  summary: { gap: space[4] },
  summaryFigures: { alignItems: 'center', gap: space[1] },
  selectors: { flexDirection: 'row', gap: space[3] },
  selector: { flex: 1 },
  footer: {
    paddingHorizontal: space[5],
    paddingVertical: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
