import { useEventResultSummary, useToggleLike } from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PostImage } from '@/components/community/PostImage';
import { avatarUrl } from '@/lib/community-images';
import { colors } from '../../theme';

export type CommunityPost = {
  id: string;
  community_id: string;
  author_id: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
  kind?: string;
  result_event_id?: string | null;
  likes: { count: number }[];
  comments: { count: number }[];
  mine: { user_id: string }[];
  author?: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

function ResultBody({ eventId }: { eventId: string }) {
  const { t } = useT('community');
  const router = useRouter();
  const { data: rows } = useEventResultSummary(eventId);
  const top = (rows ?? []).slice(0, 3);
  return (
    <View style={styles.result}>
      <Text style={styles.resultTitle}>{t('resultCardTitle')}</Text>
      {top.length === 0 ? (
        <Text style={styles.resultRow}>{t('resultUnavailable')}</Text>
      ) : (
        top.map((r) => (
          <Text key={r.rank} style={styles.resultRow}>{`${r.rank}. ${r.name} · ${r.points}`}</Text>
        ))
      )}
      <Pressable onPress={() => router.push(('/event/' + eventId) as never)} accessibilityRole="button">
        <Text style={styles.resultLink}>{t('viewEventCta')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Interactive post card: author, body, optional (private/signed) image, an
 * optimistic like toggle and a comment affordance. Tapping the body opens the
 * post detail.
 *
 * The actions row is deliberately a SIBLING of the tappable body rather than a
 * child of it. React Native marks a Pressable as an accessibility element, and
 * iOS then merges every descendant into that one element — wrapping the whole
 * card made the post a single button whose label folded in its own actions
 * ("Alex Organizer, Welcome…, Like, Comment"), so Like and Comment had no
 * element of their own and VoiceOver users could not reach them at all.
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
    <View style={styles.card}>
      <Pressable onPress={onPress} accessibilityRole="button">
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
        {post.kind === 'result' && post.result_event_id ? (
          <ResultBody eventId={post.result_event_id} />
        ) : (
          <>
            {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
            {post.image_path ? <PostImage path={post.image_path} style={styles.image} /> : null}
          </>
        )}
      </Pressable>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarInitial: { color: colors.card, fontSize: 15, fontWeight: '700' },
  author: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.foreground },
  body: { fontSize: 15, color: colors.foreground, lineHeight: 21 },
  image: { marginTop: 10 },
  result: { backgroundColor: colors.background, borderRadius: 12, padding: 12, gap: 4 },
  resultTitle: { fontSize: 12, fontWeight: '800', color: colors.primary, textTransform: 'uppercase' },
  resultRow: { fontSize: 15, color: colors.foreground, fontWeight: '500' },
  resultLink: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 20, marginTop: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { fontSize: 18, color: colors.mutedForeground },
  liked: { color: colors.destructive },
  actionText: { fontSize: 14, color: colors.mutedForeground, fontWeight: '600' },
});
