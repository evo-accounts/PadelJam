import { useQuery } from '@tanstack/react-query';
import { Image, type ImageStyle } from 'expo-image';
import { StyleSheet, View, type StyleProp } from 'react-native';

import { postImageUrl } from '@/lib/community-images';
import { colors } from '../../theme';

/**
 * Renders a private community-post image. The post-images bucket is member-gated,
 * so the URL is a short-lived signed URL resolved (and cached) via react-query.
 * Falls back to a neutral placeholder while resolving or on failure.
 */
export function PostImage({
  path,
  style,
}: {
  path: string | null | undefined;
  style?: StyleProp<ImageStyle>;
}) {
  const { data: url } = useQuery({
    queryKey: ['post-image', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000, // signed URLs last 1h; refetch before expiry
    queryFn: () => postImageUrl(path),
  });

  if (!path) return null;
  if (!url) return <View style={[styles.image, styles.placeholder, style]} />;

  return (
    <Image source={{ uri: url }} style={[styles.image, style]} contentFit="cover" transition={150} />
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 200, borderRadius: 10, backgroundColor: colors.muted },
  placeholder: { backgroundColor: colors.muted },
});
