import { useAbility, useEventResultSummary, useToggleLike } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PostImage } from '@/components/community/PostImage';
import { avatarUrl } from '@/lib/community-images';
import { colors } from '../../theme';
import { Button } from '../../components/ui';
import { Avatar } from '../ui';

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
        // standings() ranks with SQL rank(), which ties: two players level on
        // points are both rank 1, so the rank alone is not unique. The RPC
        // returns no id to key on, and the list is static for a completed
        // event, so the index disambiguates. Same key as ResultCard.
        top.map((r, i) => (
          <Text key={`${r.rank}-${i}`} style={styles.resultRow}>{`${r.rank}. ${r.name} · ${r.points}`}</Text>
        ))
      )}
      <Button
        label={t('viewEventCta')}
        variant="ghost"
        size="sm"
        onPress={() => router.push(('/event/' + eventId) as never)}
      />
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
  /**
   * Since migration 0100 a NON-MEMBER can read a public community's posts from the preview, and
   * liking is still members-only ("likes: write" was deliberately left alone). Without this the
   * preview would offer a heart that row-level security refuses — a control that looks live,
   * does nothing, and reports no reason.
   *
   * The count still shows; only the CONTROL goes. Deduped by React Query, so a list of cards
   * shares one ability query rather than one per row.
   */
  const { data: ability } = useAbility(communityId);
  const canLike = ability?.can('create', 'Like') ?? false;

  const name = post.author?.full_name ?? '—';
  const avatar = avatarUrl(post.author?.avatar_url);
  const likeCount = post.likes?.[0]?.count ?? 0;
  const commentCount = post.comments?.[0]?.count ?? 0;
  const likedByMe = (post.mine?.length ?? 0) > 0;

  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} accessibilityRole="button">
        <View style={styles.header}>
          {/* Three style keys and a hand-rolled initials fallback, replaced by
              the primitive that already does both. `avatar:` `avatarFallback:`
              and `avatarInitial:` were the most duplicated visual in the app —
              21, 11 and 14 declarations respectively. */}
          <Avatar uri={avatar} name={name} size="sm" />
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
        {canLike ? (
          <Pressable
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={t('like')}
            // Icon PLUS a count is not Button's shape, so this stays a Pressable —
            // but "liked" was conveyed by colour and glyph alone, indistinguishable
            // to assistive tech. Same fix as the post detail screen.
            accessibilityState={{ selected: likedByMe, disabled: toggleLike.isPending }}
            disabled={toggleLike.isPending}
            onPress={() => toggleLike.mutate({ postId: post.id, liked: likedByMe })}
          >
            <Text style={[styles.actionIcon, likedByMe && styles.liked]}>{likedByMe ? '♥' : '♡'}</Text>
            <Text style={styles.actionText}>{likeCount}</Text>
          </Pressable>
        ) : (
          // Not a button, and said as one element: "Like, 4" rather than a heart
          // and a number a screen reader walks past separately.
          <View style={styles.action} accessible accessibilityLabel={`${t('like')}, ${likeCount}`}>
            <Text style={styles.actionIcon}>♡</Text>
            <Text style={styles.actionText}>{likeCount}</Text>
          </View>
        )}
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
