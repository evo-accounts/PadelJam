import { reviewSchema, useCommunityReviews, useUpsertReview } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StarRating } from '@/components/community/StarRating';
import { colors, palette } from '../../../../theme';

// Maps a thrown mutation error code to an existing community-namespace i18n key.
const ERROR_KEY_MAP: Record<string, string> = {
  review_requires_participation: 'review_requires_participation',
  not_a_member: 'not_a_member',
  invalid_rating: 'reviewsRatingRequired',
  forbidden: 'forbidden',
};

export default function WriteReviewModal() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data } = useCommunityReviews(id);
  const existing = data?.reviews.find((r) => r.user_id === uid);

  const [rating, setRating] = useState<number>(existing?.rating ?? 0);
  const [body, setBody] = useState<string>(existing?.body ?? '');
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync, isPending } = useUpsertReview(id);

  async function handleSubmit() {
    setError(null);

    const parsed = reviewSchema.safeParse({ rating, body: body.trim() || undefined });
    if (!parsed.success) {
      // rating is the only required field that can fail (must be 1-5)
      setError(t('reviewsRatingRequired'));
      return;
    }

    try {
      await mutateAsync({ rating: parsed.data.rating, body: parsed.data.body });
      router.back();
    } catch (err) {
      // The mutation throws Error(<i18n key>) for gated failures.
      const code = err instanceof Error ? err.message : 'unknown_error';
      const key = ERROR_KEY_MAP[code] ?? 'unknown_error';
      setError(t(key));
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Star picker */}
          <View style={styles.section}>
            <Text style={styles.label}>{t('reviewsRatingLabel')}</Text>
            <StarRating value={rating} onChange={setRating} size={36} />
          </View>

          {/* Detail text */}
          <View style={styles.section}>
            <TextInput
              style={styles.bodyInput}
              placeholder={t('reviewsBodyPlaceholder')}
              placeholderTextColor={palette.slate[400]}
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={5}
              maxLength={2000}
              editable={!isPending}
              textAlignVertical="top"
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        {/* Footer actions */}
        <View style={styles.footer}>
          <Pressable
            style={styles.cancelBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            disabled={isPending}
          >
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </Pressable>
          <Pressable
            style={[styles.saveBtn, isPending && styles.saveBtnDisabled]}
            onPress={handleSubmit}
            accessibilityRole="button"
            disabled={isPending}
          >
            {isPending ? (
              <ActivityIndicator color={colors.card} size="small" />
            ) : (
              <Text style={styles.saveText}>{t('save')}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  content: { padding: 20, gap: 20 },
  section: { gap: 10 },
  label: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  bodyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.foreground,
    minHeight: 120,
    backgroundColor: colors.background,
  },
  errorText: { fontSize: 14, color: colors.destructive, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '600', color: colors.mutedForeground },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '700', color: colors.card },
});
