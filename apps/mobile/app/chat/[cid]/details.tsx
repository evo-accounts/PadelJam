import { useT } from '@padel/i18n';
import { appendImages, extractImageUrls, nextCursor, pageHasMore, type MsgLike } from '@padel/utils';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { streamClient } from '@/lib/streamClient';

const COLS = 3;
const GAP = 2;
const PAGE = 100;

export default function ChatDetailsScreen() {
  const { t } = useT('chat');
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
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('details') }} />
      <Text style={styles.section}>{t('media')}</Text>
      {!initialised ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 32 }} />
      ) : images.length === 0 && !hasMore ? (
        <Text style={styles.empty}>{t('noPhotos')}</Text>
      ) : (
        <FlatList
          data={images}
          numColumns={COLS}
          keyExtractor={(u, i) => u + i}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loading && images.length > 0 ? <ActivityIndicator color="#0B1F3A" style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => setViewer(index)} accessibilityRole="imagebutton">
              <Image source={{ uri: item }} style={{ width: size, height: size }} contentFit="cover" />
            </Pressable>
          )}
        />
      )}

      <Modal visible={viewer !== null} transparent={false} animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          <Pressable style={styles.close} onPress={() => setViewer(null)} accessibilityRole="button">
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  section: { fontSize: 13, fontWeight: '700', color: '#6B7685', textTransform: 'uppercase', paddingHorizontal: 12, paddingVertical: 10 },
  empty: { textAlign: 'center', marginTop: 48, color: '#6B7685', fontSize: 15 },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  close: { position: 'absolute', top: 48, right: 20, zIndex: 1, padding: 8 },
  closeText: { color: '#fff', fontSize: 22, fontWeight: '700' },
});
