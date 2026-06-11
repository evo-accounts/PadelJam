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
        <ActivityIndicator color="#0B1F3A" />
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

  const canSend = body.trim().length > 0 && !addComment.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.navbar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.back}>‹ {t('close')}</Text>
        </Pressable>
      </View>

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
              placeholderTextColor="#8896A8"
              multiline
            />
            <Pressable
              style={[styles.send, !canSend && styles.sendDisabled]}
              onPress={onSend}
              disabled={!canSend}
              accessibilityRole="button"
            >
              {addComment.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendText}>{t('send')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F8FB' },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  navbar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EAF0',
    backgroundColor: '#fff',
  },
  back: { fontSize: 16, fontWeight: '600', color: '#0B7BFF' },
  scroll: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E6EAF0' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1F3A' },
  avatarInitial: { color: '#fff', fontSize: 16, fontWeight: '700' },
  author: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0B1F3A' },
  body: { fontSize: 16, color: '#222', lineHeight: 23 },
  image: { marginTop: 12 },
  actions: { flexDirection: 'row', gap: 24, marginTop: 14 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { fontSize: 20, color: '#3A4A60' },
  liked: { color: '#E0245E' },
  actionText: { fontSize: 15, color: '#3A4A60', fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E6EAF0', marginVertical: 16 },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E6EAF0',
    backgroundColor: '#fff',
    padding: 12,
    gap: 8,
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  commentInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D7DEE8',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0B1F3A',
    backgroundColor: '#F6F8FB',
  },
  send: {
    backgroundColor: '#0B7BFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#A9C7EE' },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  error: { fontSize: 13, color: '#C0392B', fontWeight: '600' },
});
