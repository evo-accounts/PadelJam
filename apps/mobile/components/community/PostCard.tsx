import { useToggleLike } from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PostImage } from '@/components/community/PostImage';
import { avatarUrl } from '@/lib/community-images';

export type CommunityPost = {
  id: string;
  community_id: string;
  author_id: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
  likes: { count: number }[];
  comments: { count: number }[];
  mine: { user_id: string }[];
  author?: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

/**
 * Interactive post card: author, body, optional (private/signed) image, an
 * optimistic like toggle and a comment affordance. Tapping the card opens the
 * post detail.
 */
export function PostCard({
  post,
  communityId,
  onPress,
}: {
  post: CommunityPost;
  communityId: string;
  onPress?: () => void;
}) {
  const { t } = useT('community');
  const toggleLike = useToggleLike(communityId);

  const name = post.author?.full_name ?? '—';
  const avatar = avatarUrl(post.author?.avatar_url);
  const likeCount = post.likes?.[0]?.count ?? 0;
  const commentCount = post.comments?.[0]?.count ?? 0;
  const likedByMe = (post.mine?.length ?? 0) > 0;

  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button">
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
      {post.image_path ? <PostImage path={post.image_path} style={styles.image} /> : null}
      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={t('like')}
          disabled={toggleLike.isPending}
          onPress={() => toggleLike.mutate({ postId: post.id, liked: likedByMe })}
        >
          <Text style={[styles.actionIcon, likedByMe && styles.liked]}>{likedByMe ? '♥' : '♡'}</Text>
          <Text style={styles.actionText}>{likeCount}</Text>
        </Pressable>
        <Pressable
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={t('comment')}
          onPress={onPress}
        >
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionText}>{commentCount}</Text>
        </Pressable>
      </View>
    </Pressable>
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
  image: { marginTop: 10 },
  actions: { flexDirection: 'row', gap: 20, marginTop: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { fontSize: 18, color: '#3A4A60' },
  liked: { color: '#E0245E' },
  actionText: { fontSize: 14, color: '#3A4A60', fontWeight: '600' },
});
