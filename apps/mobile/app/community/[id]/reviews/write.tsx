// TODO(events): gate writing on >=3 participated events once the Events module exists
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
      const code = err instanceof Error ? err.message : 'unknown_error';
      const key = code in { unknown_error: true, forbidden: true } ? code : 'unknown_error';
      setError(t(key as 'unknown_error' | 'forbidden'));
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
              placeholderTextColor="#8A95A5"
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
              <ActivityIndicator color="#fff" size="small" />
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
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  content: { padding: 20, gap: 20 },
  section: { gap: 10 },
  label: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  bodyInput: {
    borderWidth: 1,
    borderColor: '#D0D8E4',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#0B1F3A',
    minHeight: 120,
    backgroundColor: '#F6F8FB',
  },
  errorText: { fontSize: 14, color: '#E53935', textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E6EAF0',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0D8E4',
    alignItems: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#3A4A60' },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#0B7BFF',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
