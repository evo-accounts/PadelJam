import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { coverUrl } from '@/lib/community-images';

export type SuggestedCommunity = {
  id: string;
  name: string;
  type: string;
  cover_image_path: string | null;
};

type Props = {
  community: SuggestedCommunity;
  onPress: () => void;
};

export function SuggestedCommunityCard({ community, onPress }: Props) {
  const url = coverUrl(community.cover_image_path);

  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button">
      {url ? (
        <Image source={{ uri: url }} style={styles.cover} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.cover, styles.placeholder]}>
          <Text style={styles.placeholderText}>
            {community.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {community.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 140, marginRight: 12 },
  cover: { width: 140, height: 90, borderRadius: 12, backgroundColor: '#E6EAF0' },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1F3A' },
  placeholderText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name: { marginTop: 8, fontSize: 14, fontWeight: '600', color: '#0B1F3A' },
});
