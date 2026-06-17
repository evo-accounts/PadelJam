import { usePostEventResult } from '@padel/api';
import { useT } from '@padel/i18n';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export function ShareResultsModal({
  visible,
  onClose,
  eventId,
  communityId,
  summaryText,
}: {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  communityId: string | null;
  summaryText: string;
}) {
  const { t } = useT('event');
  const postResult = usePostEventResult(eventId);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPost = () => {
    if (!communityId || postResult.isPending) return;
    setError(null);
    postResult
      .mutateAsync(communityId)
      .then(() => setPosted(true))
      .catch((e) => setError(t(e instanceof Error ? e.message : 'unknown_error')));
  };

  const onShare = async () => {
    if (await Sharing.isAvailableAsync()) {
      // expo-sharing shares files/URLs; for a plain text summary, fall back to clipboard.
      await Clipboard.setStringAsync(summaryText);
    } else {
      await Clipboard.setStringAsync(summaryText);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('shareResultsTitle')}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {communityId ? (
            <Pressable
              style={[styles.btn, styles.primary, (posted || postResult.isPending) && styles.disabled]}
              disabled={posted || postResult.isPending}
              onPress={onPost}
              accessibilityRole="button"
            >
              {postResult.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryLabel}>{posted ? t('resultPosted') : t('postToFeedCta')}</Text>
              )}
            </Pressable>
          ) : null}
          <Pressable style={[styles.btn, styles.secondary]} onPress={onShare} accessibilityRole="button">
            <Text style={styles.secondaryLabel}>{t('shareExternalCta')}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#0B1F3A' },
  error: { color: '#D7263D', fontSize: 14, fontWeight: '600' },
  btn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#0B7BFF' },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondary: { backgroundColor: '#F0F3F8' },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
  disabled: { opacity: 0.5 },
});
