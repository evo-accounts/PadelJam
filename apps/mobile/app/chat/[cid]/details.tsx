import { useT } from '@padel/i18n';
import { appendImages, extractImageUrls, nextCursor, pageHasMore, type MsgLike } from '@padel/utils';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { streamClient } from '@/lib/streamClient';
import { colors, palette } from '../../../theme';
import { EmptyState, emptyIcon, listEmptyContent, TopBar } from '../../../components/ui';

const COLS = 3;
const GAP = 2;
const PAGE = 100;

export default function ChatDetailsScreen() {
  const { t } = useT('chat');
  const router = useRouter();
  const { cid } = useLocalSearchParams<{ cid: string }>();
  const [images, setImages] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);

  const channel = useMemo(() => {
    if (!cid) return null;
    const [type, id] = cid.split(':');
    if (!type || !id) return null;
    return streamClient.channel(type, id);
  }, [cid]);

  const loadMore = useCallback(async () => {
    if (!channel || loading) return;
    setLoading(true);
    try {
      const res = await channel.query({ messages: { limit: PAGE, ...(cursor ? { id_lt: cursor } : {}) } });
      const msgs = res.messages as unknown as MsgLike[];
      setImages((cur) => appendImages(cur, extractImageUrls(msgs)));
      setCursor(nextCursor(msgs));
      setHasMore(pageHasMore(msgs, PAGE));
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
      setInitialised(true);
    }
  }, [channel, cursor, loading]);

  // Initial page once the channel resolves.
  useEffect(() => {
    if (channel) void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const onEndReached = () => {
    if (hasMore && !loading) void loadMore();
  };

  const size = (Dimensions.get('window').width - GAP * (COLS - 1)) / COLS;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('details')} onBack={() => router.back()} />
      <Text style={styles.section}>{t('media')}</Text>
      {!initialised ? (
        <ActivityIndicator color={colors.foreground} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={images}
          numColumns={COLS}
          keyExtractor={(u, i) => u + i}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={[{ gap: GAP }, listEmptyContent]}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            hasMore ? null : (
              <EmptyState
                fill
                icon={emptyIcon('photo')}
                title={t('noPhotos')}
                body={t('chatMediaEmptyBody')}
                testID="empty-chat-media"
              />
            )
          }
          ListFooterComponent={loading && images.length > 0 ? <ActivityIndicator color={colors.foreground} style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => setViewer(index)} accessibilityRole="imagebutton">
              <Image source={{ uri: item }} style={{ width: size, height: size }} contentFit="cover" />
            </Pressable>
          )}
        />
      )}

      <Modal visible={viewer !== null} transparent={false} animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          <Pressable
            style={styles.close}
            onPress={() => setViewer(null)}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          {viewer !== null ? (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              initialScrollIndex={viewer}
              getItemLayout={(_, i) => ({ length: Dimensions.get('window').width, offset: Dimensions.get('window').width * i, index: i })}
              keyExtractor={(u, i) => 'full' + u + i}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={{ width: Dimensions.get('window').width, height: '100%' }} contentFit="contain" />
              )}
            />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  section: { fontSize: 13, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase', paddingHorizontal: 12, paddingVertical: 10 },
  viewer: { flex: 1, backgroundColor: palette.black, justifyContent: 'center' },
  close: { position: 'absolute', top: 48, right: 20, zIndex: 1, padding: 8 },
  closeText: { color: colors.card, fontSize: 22, fontWeight: '700' },
});
