import { useAbility, useCommunityFeedRealtime, useCommunityPosts, useMyProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useCommunityId } from '@/components/community/CommunityIdContext';
import { ComposerEntry } from '@/components/community/ComposerEntry';
import { PostCard, type CommunityPost } from '@/components/community/PostCard';
import { EmptyState, emptyIcon, listEmptyContent } from '../../ui';
import { colors } from '../../../theme';

export default function CommunityPostsScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const id = useCommunityId();

  useCommunityFeedRealtime(id);
  const { data: posts, isLoading, isError, refetch } = useCommunityPosts(id);
  const { data: ability } = useAbility(id);
  const { data: me } = useMyProfile();
  // The ability is already scoped to this community (built from the member's role
  // + permissions for `id`), so a type-only check evaluates its community_id
  // conditions correctly without importing CASL's subject() helper into mobile.
  const canCompose = ability?.can('create', 'Post') ?? false;
  const openComposer = () => router.push(`/community/${id}/compose`);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  const rows = (posts ?? []) as CommunityPost[];

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        keyExtractor={(p) => p.id}
        /*
          UX-COMM-10: pinned at the top and "always visible even with no posts",
          so it is the list header rather than part of the empty state — the one
          thing you can do with an empty feed should not live inside the message
          saying it is empty. `ListHeaderComponent` renders above
          `ListEmptyComponent`, which is exactly that.
        */
        ListHeaderComponent={
          canCompose ? (
            <ComposerEntry
              avatarPath={me?.avatar_url}
              name={me?.full_name}
              onPress={openComposer}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            communityId={id}
            onPress={() => router.push(`/community/${id}/post/${item.id}`)}
          />
        )}
        contentContainerStyle={[styles.list, listEmptyContent]}
        ListEmptyComponent={
          isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError', { ns: 'common' })}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => refetch() }}
              testID="empty-posts"
            />
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('text.bubble')}
              title={t('noPosts')}
              body={t('communityPostsEmptyBody')}
              // No CTA here any more: the composer entry is pinned directly
              // above this empty state, so a second identical action inside it
              // would be the same button twice in one screenful.
              testID="empty-posts"
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  list: { paddingVertical: 8 },
});
