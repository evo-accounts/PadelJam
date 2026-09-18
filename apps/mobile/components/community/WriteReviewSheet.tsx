/**
 * Writing or editing a review (UX-COMM-13): "a bottom sheet with ✕, star
 * selector, details field, primary and secondary actions".
 *
 * It replaces a full SCREEN, and the screenshots are what settled it: a rating
 * row and one text box left roughly half an iPhone empty between the field and
 * the action. A sheet sizes to its content, and it keeps the reviews you are
 * about to add to visible behind it.
 *
 * This does NOT contradict the preview staying a full screen (the audit asked
 * for a sheet there and the decision went the other way). That is a destination
 * carrying an identity block, attributes, admins, rules and five tabs. This is
 * two fields.
 *
 * NO DISCARD CONFIRMATION, deliberately. The screen this replaces had one, via
 * `TopBar dirty`, but a confirm is itself a sheet: `SheetHost` goes to real
 * trouble to render every confirm through ONE Modal element precisely because
 * iOS refuses to present a second while the first is dismissing. Asking for a
 * confirmation from inside this sheet would be that second Modal. The audit
 * specifies ✕ plus two actions and no guard, a sheet reads as dismissible in a
 * way a full-screen task does not, and the cost of being wrong is retyping a
 * short review rather than losing work that cannot be reproduced.
 */
import { reviewSchema, useCommunityReviews, useUpsertReview } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Field, Rating, Text, useBanner } from '../ui';
import { space } from '../../theme';

/** Server error codes that have copy of their own; anything else is generic. */
const ERROR_KEY_MAP: Record<string, string> = {
  review_requires_participation: 'review_requires_participation',
  not_a_member: 'not_a_member',
  invalid_rating: 'reviewsRatingRequired',
  forbidden: 'forbidden',
};

export function WriteReviewSheet({
  communityId,
  visible,
  onClose,
}: {
  communityId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useT('community');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const uid = useSession().session?.user.id;

  const { data } = useCommunityReviews(communityId);
  const existing = data?.reviews.find((r) => r.user_id === uid);

  /**
   * Seeded by the initialisers, and kept correct across opens by the REMOUNT the
   * parent forces with a changing `key` — not by an effect that writes state
   * back on every open.
   *
   * It matters because this component, unlike the screen it replaces, is not
   * torn down between visits: without the remount a second open would show
   * whatever was typed and abandoned the first time.
   */
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? '');

  const { mutateAsync, isPending } = useUpsertReview(communityId);

  const submit = async () => {
    const parsed = reviewSchema.safeParse({ rating, body: body.trim() || undefined });
    if (!parsed.success) {
      // The rating is the only required field that can fail, and it is not a
      // `Field`, so there is no border to redden — the banner alone carries it.
      banner.show(tc('missingInformation'));
      return;
    }
    try {
      await mutateAsync({ rating: parsed.data.rating, body: parsed.data.body });
      onClose();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'unknown_error';
      banner.show(t(ERROR_KEY_MAP[code] ?? 'unknown_error'));
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={existing ? t('reviewsEditCta') : t('reviewsWriteTitle')}
      testID="write-review-sheet"
    >
      <View style={styles.body}>
        <View style={styles.section}>
          <Text variant="label">{t('reviewsRatingLabel')}</Text>
          <Rating value={rating} onChange={setRating} size="lg" testID="review-rating" />
        </View>

        <Field
          value={body}
          placeholder={t('reviewsBodyPlaceholder')}
          onChangeText={setBody}
          multiline
          numberOfLines={4}
          maxLength={2000}
          editable={!isPending}
          testID="review-body"
        />

        <View style={styles.actions}>
          <Button
            label={t('save')}
            fullWidth
            loading={isPending}
            onPress={() => void submit()}
            testID="review-save"
          />
          <Button
            label={tc('cancel')}
            variant="ghost"
            fullWidth
            disabled={isPending}
            onPress={onClose}
            testID="review-cancel"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4] },
  section: { gap: space[2] },
  actions: { gap: space[2] },
});
