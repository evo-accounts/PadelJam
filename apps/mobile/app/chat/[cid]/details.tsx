import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { streamClient } from '@/lib/streamClient';

const COLS = 3;
const GAP = 2;

export default function ChatDetailsScreen() {
  const { t } = useT('chat');
  const { cid } = useLocalSearchParams<{ cid: string }>();
  const [images, setImages] = useState<string[] | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    if (!cid) return;
    let cancelled = false;
    const [type, id] = cid.split(':');
    if (!type || !id) return;
    const channel = streamClient.channel(type, id);
    channel
      .query({ messages: { limit: 100 } })
      .then((res) => {
        const urls: string[] = [];
        // newest first
        for (let i = res.messages.length - 1; i >= 0; i--) {
          for (const a of res.messages[i]?.attachments ?? []) {
            if (a.type === 'image' && (a.image_url || a.asset_url)) urls.push((a.image_url ?? a.asset_url) as string);
          }
        }
        if (!cancelled) setImages(urls);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cid]);

  const size = (Dimensions.get('window').width - GAP * (COLS - 1)) / COLS;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('details') }} />
      <Text style={styles.section}>{t('media')}</Text>
      {images === null ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 32 }} />
      ) : images.length === 0 ? (
        <Text style={styles.empty}>{t('noPhotos')}</Text>
      ) : (
        <FlatList
          data={images}
          numColumns={COLS}
          keyExtractor={(u, i) => u + i}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP }}
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
          {images && viewer !== null ? (
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
