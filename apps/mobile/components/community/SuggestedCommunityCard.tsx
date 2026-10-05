import { Image } from 'expo-image';
import { Pressable, StyleSheet, View, type ImageStyle } from 'react-native';
import { Text } from '@/components/ui/native';

import { coverUrl } from '@/lib/community-images';
import { colors } from '../../theme';

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

/**
 * A community's cover image, or an initial-letter fallback tinted with the
 * primary colour. Exported so `CommunityCard` (UX-GLOB-09) can render the
 * same treatment at its own sizes instead of reimplementing the fallback.
 */
export function CommunityThumb({
  url,
  name,
  style,
}: {
  url: string | null;
  name: string;
  /**
   * `ImageStyle` rather than `ViewStyle`: it is narrower (its `overflow` has
   * no `'scroll'`), which is what lets the same value satisfy both the
   * `<Image>` branch below AND the `<View>` fallback's `style` prop.
   */
  style: ImageStyle;
}) {
  return url ? (
    <Image source={{ uri: url }} style={style} contentFit="cover" transition={150} />
  ) : (
    <View style={[style, styles.placeholder]}>
      <Text style={styles.placeholderText}>{(name.charAt(0) || '?').toUpperCase()}</Text>
    </View>
  );
}

export function SuggestedCommunityCard({ community, onPress }: Props) {
  const url = coverUrl(community.cover_image_path);

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      testID={`community-rail-card-${community.id}`}
    >
      <CommunityThumb url={url} name={community.name} style={styles.cover} />
      <Text style={styles.name} numberOfLines={1}>
        {community.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 140, marginRight: 12 },
  cover: { width: 140, height: 90, borderRadius: 12, backgroundColor: colors.muted },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  placeholderText: { color: colors.card, fontSize: 28, fontWeight: '700' },
  name: { marginTop: 8, fontSize: 14, fontWeight: '600', color: colors.foreground },
});
