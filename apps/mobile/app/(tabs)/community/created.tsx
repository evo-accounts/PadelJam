import { useUpdateCommunity } from '@padel/api';
import { useT } from '@padel/i18n';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@padel/auth';
import { consumePendingCommunityImages } from '@/lib/community-image-handoff';
import { uploadCommunityImage } from '@/lib/storage';
import { Button, Text } from '../../../components/ui';
import { colors } from '../../../theme';

const THUMBNAIL_BUCKET = 'community-thumbnails';
const COVER_BUCKET = 'community-covers';

export default function CommunityCreatedScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useSession();
  const updateCommunity = useUpdateCommunity(id ?? '');

  const [copied, setCopied] = useState(false);
  const deepLink = `padeljam://community/${id}`;
  const uploadedRef = useRef(false);

  // Upload the picked images now that the community exists, then persist paths.
  useEffect(() => {
    if (!id || uploadedRef.current) return;
    uploadedRef.current = true;

    const { thumbnail, cover } = consumePendingCommunityImages();
    if (!thumbnail && !cover) return;

    void (async () => {
      try {
        const patch: { thumbnail_path?: string; cover_image_path?: string } = {};
        if (thumbnail) {
          patch.thumbnail_path = await uploadCommunityImage(
            client,
            THUMBNAIL_BUCKET,
            id,
            thumbnail.uri,
            thumbnail.mimeType,
          );
        }
        if (cover) {
          patch.cover_image_path = await uploadCommunityImage(
            client,
            COVER_BUCKET,
            id,
            cover.uri,
            cover.mimeType,
          );
        }
        if (Object.keys(patch).length > 0) {
          await updateCommunity.mutateAsync(patch);
        }
      } catch {
        // Image upload is best-effort; the community already exists.
      }
    })();
  }, [id, client, updateCommunity]);

  const onCopy = async () => {
    await Clipboard.setStringAsync(deepLink);
    setCopied(true);
  };

  const onShare = async () => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(deepLink);
    } else {
      await Clipboard.setStringAsync(deepLink);
      setCopied(true);
    }
  };

  const onQr = () => {
    router.push(`/community/${id}/qr` as never);
  };

  const onManage = () => {
    // The community page (Task 17) now exists; open it on its first tab. The bare
    // `/community/[id]` group route resolves at runtime but isn't typed.
    if (id) router.replace(`/community/${id}/posts`);
    else router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Text variant="display" tone="default" style={styles.title}>
        {t('createdTitle')}
      </Text>
      <Text variant="body" tone="muted" style={styles.subtitle}>
        {t('createdSubtitle')}
      </Text>

      <View style={styles.actions}>
        <Button fullWidth label={t('share')} onPress={onShare} />
        <Button
          variant="outline"
          fullWidth
          label={copied ? t('linkCopied') : t('copyLink')}
          onPress={onCopy}
        />
        <Button variant="outline" fullWidth label={t('qrCode')} onPress={onQr} />
        {/* Still disabled, and still announced as such: Button forwards
            accessibilityState.disabled, which the hand-rolled version did not —
            it dimmed to 0.45 opacity and told a screen reader nothing. */}
        <Button
          variant="outline"
          fullWidth
          disabled
          label={`${t('createEvent')} (${t('comingSoon')})`}
          onPress={() => {}}
        />
      </View>

      <Button fullWidth label={t('manageCommunity')} onPress={onManage} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card, paddingHorizontal: 24 },
  // Spacing only — size, weight and colour now come from the variant/tone.
  title: { marginBottom: 8 },
  subtitle: { marginBottom: 32 },
  actions: { gap: 12, flex: 1 },
});
