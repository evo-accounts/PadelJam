import { useUpdateCommunity } from '@padel/api';
import { useT } from '@padel/i18n';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@padel/auth';
import { consumePendingCommunityImages } from '@/lib/community-image-handoff';
import { uploadCommunityImage } from '@/lib/storage';
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
      <Text style={styles.title}>{t('createdTitle')}</Text>
      <Text style={styles.subtitle}>{t('createdSubtitle')}</Text>

      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={onShare} accessibilityRole="button">
          <Text style={styles.buttonText}>{t('share')}</Text>
        </Pressable>

        <Pressable style={styles.secondary} onPress={onCopy} accessibilityRole="button">
          <Text style={styles.secondaryText}>{copied ? t('linkCopied') : t('copyLink')}</Text>
        </Pressable>

        <Pressable style={styles.secondary} onPress={onQr} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('qrCode')}</Text>
        </Pressable>

        <Pressable style={[styles.secondary, styles.disabled]} disabled accessibilityRole="button">
          <Text style={styles.secondaryText}>
            {t('createEvent')} ({t('comingSoon')})
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.manage} onPress={onManage} accessibilityRole="button">
        <Text style={styles.buttonText}>{t('manageCommunity')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card, paddingHorizontal: 24 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8, color: colors.foreground },
  subtitle: { fontSize: 15, color: colors.mutedForeground, marginBottom: 32 },
  actions: { gap: 12, flex: 1 },
  button: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '600' },
  secondary: {
    borderWidth: 1,
    borderColor: colors.foreground,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { color: colors.foreground, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  manage: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
});
