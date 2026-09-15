import { reviewSchema, useCommunityReviews, useUpsertReview } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDirty } from '@/lib/useDirty';
import { colors, space } from '../../../../theme';
import { Button, Field, Rating, Text, TopBar, useBanner } from '../../../../components/ui';

// Maps a thrown mutation error code to an existing community-namespace i18n key.
const ERROR_KEY_MAP: Record<string, string> = {
  review_requires_participation: 'review_requires_participation',
  not_a_member: 'not_a_member',
  invalid_rating: 'reviewsRatingRequired',
  forbidden: 'forbidden',
};

export default function WriteReviewModal() {
  const { t } = useT('community');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data } = useCommunityReviews(id);
  const existing = data?.reviews.find((r) => r.user_id === uid);

  const [rating, setRating] = useState<number>(existing?.rating ?? 0);
  const [body, setBody] = useState<string>(existing?.body ?? '');

  const { mutateAsync, isPending } = useUpsertReview(id);

  const initial = useMemo(
    () => ({ rating: existing?.rating ?? 0, body: existing?.body ?? '' }),
    [existing?.rating, existing?.body],
  );
  const dirty = useDirty({ rating, body }, initial);

  async function handleSubmit() {
    const parsed = reviewSchema.safeParse({ rating, body: body.trim() || undefined });
    if (!parsed.success) {
      // rating is the only required field that can fail (must be 1-5); it isn't a
      // `Field`, so there's no border to redden — the banner alone carries this.
      banner.show(tc('missingInformation'));
      return;
    }

    try {
      await mutateAsync({ rating: parsed.data.rating, body: parsed.data.body });
      router.back();
    } catch (err) {
      // The mutation throws Error(<i18n key>) for gated failures.
      const code = err instanceof Error ? err.message : 'unknown_error';
      const key = ERROR_KEY_MAP[code] ?? 'unknown_error';
      banner.show(t(key));
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TopBar variant="edit" title={t('reviewsWriteTitle')} onClose={() => router.back()} dirty={dirty} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Star picker */}
          <View style={styles.section}>
            <Text variant="label">{t('reviewsRatingLabel')}</Text>
            <Rating value={rating} onChange={setRating} size="lg" testID="review-rating" />
          </View>

          {/* Detail text */}
          <View style={styles.section}>
            <Field
              value={body}
              placeholder={t('reviewsBodyPlaceholder')}
              onChangeText={setBody}
              multiline
              numberOfLines={5}
              maxLength={2000}
              editable={!isPending}
            />
          </View>
        </ScrollView>

        {/* Footer action */}
        <View style={styles.footer}>
          <Button label={t('save')} size="lg" fullWidth loading={isPending} onPress={handleSubmit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  content: { padding: space[5], gap: space[5] },
  section: { gap: space[2] },
  footer: {
    paddingHorizontal: space[5],
    paddingVertical: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
