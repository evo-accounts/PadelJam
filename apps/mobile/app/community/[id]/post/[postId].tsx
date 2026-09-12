import {
  commentSchema,
  useAddComment,
  useComments,
  useCommunityFeedRealtime,
  usePost,
  useToggleLike,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentList, type PostComment } from '@/components/community/CommentList';
import { PostImage } from '@/components/community/PostImage';
import { avatarUrl } from '@/lib/community-images';
import { colors } from '../../../../theme';
import { Button, TopBar } from '@/components/ui';

const KNOWN_ERROR_KEYS = new Set(['unknown_error']);

export default function PostDetailScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const { id, postId } = useLocalSearchParams<{ id: string; postId: string }>();

  const { data: post, isLoading } = usePost(postId);
  const { data: comments } = useComments(postId);
  // The feed realtime keyed by the post's community keeps like/comment counts live.
  useCommunityFeedRealtime(post?.community_id ?? id);
  const toggleLike = useToggleLike(post?.community_id ?? id);
  const addComment = useAddComment();

  const [body, setBody] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  if (isLoading || !post) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  const name = post.author?.full_name ?? '—';
  const avatar = avatarUrl(post.author?.avatar_url);
  const likeCount = post.likes?.[0]?.count ?? 0;
  const commentCount = post.comments?.[0]?.count ?? 0;
  const likedByMe = (post.mine?.length ?? 0) > 0;

  const onSend = () => {
    setErrorKey(null);
    const parsed = commentSchema.safeParse({ body });
    if (!parsed.success) return;
    void (async () => {
      try {
        await addComment.mutateAsync({
          postId: post.id,
          communityId: post.community_id,
          body: parsed.data.body,
        });
        setBody('');
      } catch (e) {
        const code = e instanceof Error ? e.message : 'unknown_error';
        setErrorKey(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error');
      }
    })();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <TopBar title={t('postTitle')} onBack={() => router.back()} backLabel={t('back')} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
              // Stays a Pressable: an icon PLUS a count is not Button's shape.
              // But "liked" was conveyed by colour and glyph shape alone, so a
              // screen reader could not tell the two states apart.
              accessibilityState={{ selected: likedByMe, disabled: toggleLike.isPending }}
              disabled={toggleLike.isPending}
              onPress={() => toggleLike.mutate({ postId: post.id, liked: likedByMe })}
            >
              <Text style={[styles.actionIcon, likedByMe && styles.liked]}>
                {likedByMe ? '♥' : '♡'}
              </Text>
              <Text style={styles.actionText}>{likeCount}</Text>
            </Pressable>
            <View style={styles.action}>
              <Text style={styles.actionIcon}>💬</Text>
              <Text style={styles.actionText}>{commentCount}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <CommentList comments={(comments ?? []) as PostComment[]} />
        </ScrollView>

        <View style={styles.composer}>
          {errorKey ? <Text style={styles.error}>{t(errorKey)}</Text> : null}
          <View style={styles.composerRow}>
            <TextInput
              style={styles.commentInput}
              value={body}
              onChangeText={setBody}
              placeholder={t('addCommentPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              multiline
            />
            {/* `isPending ? <ActivityIndicator/> : <Text/>` — `loading` written
                longhand for the fourteenth time in this migration. The compound
                `canSend` splits into its two real reasons. */}
            <Button
              label={t('send')}
              onPress={onSend}
              loading={addComment.isPending}
              disabled={body.trim().length === 0}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarInitial: { color: colors.card, fontSize: 16, fontWeight: '700' },
  author: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.foreground },
  body: { fontSize: 16, color: colors.foreground, lineHeight: 23 },
  image: { marginTop: 12 },
  actions: { flexDirection: 'row', gap: 24, marginTop: 14 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { fontSize: 20, color: colors.mutedForeground },
  liked: { color: colors.destructive },
  actionText: { fontSize: 15, color: colors.mutedForeground, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.muted, marginVertical: 16 },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    padding: 12,
    gap: 8,
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  commentInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  error: { fontSize: 13, color: colors.destructive, fontWeight: '600' },
});
