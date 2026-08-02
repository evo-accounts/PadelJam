import { useCanReviewCommunity, useCommunityReviews } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReviewCard, type ReviewRow } from '@/components/community/ReviewCard';
import { StarRating } from '@/components/community/StarRating';
import { colors, palette } from '../../../../theme';
import { Button, Chip } from '../../../../components/ui';

type SortKey = 'newest' | 'highest' | 'lowest';
type RatingFilter = 0 | 1 | 2 | 3 | 4 | 5; // 0 = all

export default function ReviewsScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data } = useCommunityReviews(id);
  const reviews = data?.reviews ?? [];
  const average = data?.average ?? null;
  const count = data?.count ?? 0;

  const [sort, setSort] = useState<SortKey>('newest');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>(0);

  const myReview = reviews.find((r) => r.user_id === uid);

  const { data: canReview } = useCanReviewCommunity(id);
  // Existing reviewers can always edit; treat a still-loading `canReview` as not
  // yet allowed so the write button doesn't flash in for non-eligible users.
  const canWrite = (canReview ?? false) || !!myReview;

  const filtered = useMemo<ReviewRow[]>(() => {
    let list = reviews as ReviewRow[];
    if (ratingFilter !== 0) {
      list = list.filter((r) => r.rating === ratingFilter);
    }
    switch (sort) {
      case 'newest':
        list = [...list].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
      case 'highest':
        list = [...list].sort((a, b) => b.rating - a.rating);
        break;
      case 'lowest':
        list = [...list].sort((a, b) => a.rating - b.rating);
        break;
    }
    return list;
  }, [reviews, sort, ratingFilter]);

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'newest', label: t('reviewsSortNewest') },
    { key: 'highest', label: t('reviewsSortHighest') },
    { key: 'lowest', label: t('reviewsSortLowest') },
  ];

  const RATING_OPTIONS: { value: RatingFilter; label: string }[] = [
    { value: 0, label: t('reviewsFilterAll') },
    { value: 5, label: '5' },
    { value: 4, label: '4' },
    { value: 3, label: '3' },
    { value: 2, label: '2' },
    { value: 1, label: '1' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Summary header */}
      <View style={styles.summaryBlock}>
        {average != null ? (
          <>
            <Text style={styles.averageText}>{average.toFixed(1)}</Text>
            <StarRating value={average} size={24} />
            <Text style={styles.countText}>
              {t('reviewsCount', { count })}
            </Text>
          </>
        ) : (
          <Text style={styles.countText}>{t('noReviews')}</Text>
        )}
      </View>

      {/* Write / Edit button (gated on participation; existing reviewers can edit) */}
      {canWrite ? (
        <Button
          label={myReview ? t('reviewsEditCta') : t('reviewsWriteCta')}
          variant="outline"
          fullWidth
          onPress={() => router.push(`/community/${id}/reviews/write`)}
        />
      ) : (
        <Text style={styles.gateNotice}>{t('reviewsGateBody')}</Text>
      )}

      {/* Sort controls */}
      <View style={styles.controlsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SORT_OPTIONS.map((opt) => (
            <Chip
              key={opt.key}
              label={opt.label}
              selected={sort === opt.key}
              onPress={() => setSort(opt.key)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Rating filter */}
      <View style={styles.controlsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {RATING_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.chip, ratingFilter === opt.value && styles.chipActive]}
              onPress={() => setRatingFilter(opt.value)}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, ratingFilter === opt.value && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('noReviews')}</Text>
        </View>
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ReviewCard review={item} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  summaryBlock: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 6,
  },
  averageText: { fontSize: 36, fontWeight: '700', color: colors.foreground },
  countText: { fontSize: 14, color: palette.slate[400] },
  gateNotice: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: palette.slate[400],
    textAlign: 'center',
  },
  controlsRow: { paddingBottom: 4 },
  chips: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.mutedForeground },
  chipTextActive: { color: colors.card },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 16, color: palette.slate[400], textAlign: 'center' },
});
