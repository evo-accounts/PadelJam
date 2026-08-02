import { usePostEventResult } from '@padel/api';
import { useT } from '@padel/i18n';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { ResultCard } from './ResultCard';
import { colors } from '../../theme';
import { Button } from '../../components/ui';

export function ShareResultsModal({
  visible,
  onClose,
  eventId,
  communityId,
  summaryText,
  eventName,
}: {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  communityId: string | null;
  summaryText: string;
  eventName?: string;
}) {
  const { t } = useT('event');
  const postResult = usePostEventResult(eventId);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<View>(null);

  const onPost = () => {
    if (!communityId || postResult.isPending) return;
    setError(null);
    postResult
      .mutateAsync(communityId)
      .then(() => setPosted(true))
      .catch((e) => setError(t(e instanceof Error ? e.message : 'unknown_error')));
  };

  const [copied, setCopied] = useState(false);
  const onShare = async () => {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('shareResultsTitle') });
        return;
      }
      throw new Error('sharing_unavailable');
    } catch {
      // Fallback: native text share (current behavior), then clipboard.
      try {
        await Share.share({ message: summaryText });
      } catch {
        await Clipboard.setStringAsync(summaryText);
        setCopied(true);
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('shareResultsTitle')}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {communityId ? (
            <Button
              label={posted ? t('resultPosted') : t('postToFeedCta')}
              fullWidth
              loading={postResult.isPending}
              disabled={posted}
              onPress={onPost}
            />
          ) : null}
          <Button
            label={copied ? t('copied') : t('shareExternalCta')}
            variant="outline"
            fullWidth
            onPress={onShare}
          />
          <View ref={cardRef} collapsable={false} style={styles.offscreen}>
            <ResultCard eventId={eventId} eventName={eventName} />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: colors.foreground },
  error: { color: colors.destructive, fontSize: 14, fontWeight: '600' },
  offscreen: { position: 'absolute', left: -9999, top: 0 },
});
