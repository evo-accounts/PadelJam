import { useCommunity, useUpdateCommunity } from '@padel/api';
import { useT } from '@padel/i18n';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@padel/auth';
import { QrSheet } from '@/components/community/QrSheet';
import { consumePendingCommunityImages } from '@/lib/community-image-handoff';
import { copyCommunityLink, shareCommunity } from '@/lib/communityShare';
import { uploadCommunityImage } from '@/lib/storage';
import { Button, Illustration, Text, TopBar, useBanner } from '../../../components/ui';
import { colors, space } from '../../../theme';

const THUMBNAIL_BUCKET = 'community-thumbnails';
const COVER_BUCKET = 'community-covers';

export default function CommunityCreatedScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useSession();
  const updateCommunity = useUpdateCommunity(id ?? '');
  const { data: community } = useCommunity(id);

  const banner = useBanner();
  const [qrOpen, setQrOpen] = useState(false);
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

  const onShare = () => void shareCommunity(id ?? '', community?.name ?? '');

  const onCopy = async () => {
    await copyCommunityLink(id ?? '');
    banner.show(t('linkCopied'), 'success');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* No back affordance: the community exists, so there is nothing to go
          back TO. Both bottom actions leave this screen for somewhere real. */}
      <TopBar variant="edit" title={t('createdTitle')} onClose={() => router.replace(`/community/${id}` as Href)} />

      <View style={[styles.body, { paddingBottom: insets.bottom + space[3] }]}>
        <View style={styles.hero}>
          <Illustration name="communityCreated" />
          <Text variant="title" style={styles.centred}>
            {t('createdTitle')}
          </Text>
          <Text variant="body" tone="muted" style={styles.centred}>
            {t('createdSubtitle')}
          </Text>
        </View>

        {/* UX-COMM-02: three square actions side by side, not a stack of
            full-width buttons — they are peers, and none is the next step. */}
        <View style={styles.squares}>
          <Button variant="outline" label={t('share')} style={styles.square} onPress={onShare} testID="created-share" />
          <Button variant="outline" label={t('copyLink')} style={styles.square} onPress={() => void onCopy()} testID="created-copy" />
          <Button variant="outline" label={t('qrCode')} style={styles.square} onPress={() => setQrOpen(true)} testID="created-qr" />
        </View>

        <View style={styles.footer}>
          {/*
            Always enabled. It used to be disabled with "(coming soon)" beside it,
            which UX-COMM-02 rules out explicitly — and the event wizard has taken
            a communityId for some time, so there was nothing left to wait for.
          */}
          <Button
            label={t('createEvent')}
            size="lg"
            fullWidth
            onPress={() => router.push(`/event/create?communityId=${id}` as Href)}
            testID="created-create-event"
          />
          <Button
            label={t('manageCommunity')}
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => router.replace(`/community/${id}` as Href)}
            testID="created-manage"
          />
        </View>
      </View>

      <QrSheet visible={qrOpen} onClose={() => setQrOpen(false)} communityId={id ?? ''} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  body: { flex: 1, paddingHorizontal: space[6], paddingTop: space[5], gap: space[5] },
  hero: { alignItems: 'center', gap: space[3] },
  centred: { textAlign: 'center' },
  squares: { flexDirection: 'row', gap: space[3] },
  square: { flex: 1 },
  footer: { marginTop: 'auto', gap: space[3] },
});
