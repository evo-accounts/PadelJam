import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { avatarUrl, coverUrl } from '@/lib/community-images';

export type CommunityPost = {
  id: string;
  author_id: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
  likes: { count: number }[];
  comments: { count: number }[];
  mine: { user_id: string }[];
  author?: { full_name: string | null; avatar_url: string | null } | null;
};

/**
 * Read-only post card: author, body, optional image and like/comment counts.
 * Like/comment interactions and post detail land in Task 18.
 */
export function PostCard({ post }: { post: CommunityPost }) {
  const name = post.author?.full_name ?? '—';
  const avatar = avatarUrl(post.author?.avatar_url);
  const image = coverUrl(post.image_path);
  const likeCount = post.likes?.[0]?.count ?? 0;
  const commentCount = post.comments?.[0]?.count ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" transition={120} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{(name.charAt(0) || '?').toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.author} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
      {image ? (
        <Image source={{ uri: image }} style={styles.image} contentFit="cover" transition={150} />
      ) : null}
      <View style={styles.counts}>
        <Text style={styles.count}>♥ {likeCount}</Text>
        <Text style={styles.count}>💬 {commentCount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6EAF0',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E6EAF0' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1F3A' },
  avatarInitial: { color: '#fff', fontSize: 15, fontWeight: '700' },
  author: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  body: { fontSize: 15, color: '#222', lineHeight: 21 },
  image: { width: '100%', height: 200, borderRadius: 10, marginTop: 10, backgroundColor: '#E6EAF0' },
  counts: { flexDirection: 'row', gap: 16, marginTop: 12 },
  count: { fontSize: 14, color: '#3A4A60', fontWeight: '600' },
});
