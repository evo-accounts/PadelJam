import { useAbility, useCommunityFeedRealtime, useCommunityPosts } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCommunityId } from '@/components/community/CommunityIdContext';
import { PostCard, type CommunityPost } from '@/components/community/PostCard';

export default function CommunityPostsScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const id = useCommunityId();

  useCommunityFeedRealtime(id);
  const { data: posts, isLoading, isError } = useCommunityPosts(id);
  const { data: ability } = useAbility(id);
  // The ability is already scoped to this community (built from the member's role
  // + permissions for `id`), so a type-only check evaluates its community_id
  // conditions correctly without importing CASL's subject() helper into mobile.
  const canCompose = ability?.can('create', 'Post') ?? false;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#0B1F3A" />
      </View>
    );
  }

  const rows = (posts ?? []) as CommunityPost[];

  return (
    <View style={styles.container}>
      {rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.empty, isError && styles.error]}>
            {isError ? t('loadError') : t('noPosts')}
          </Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              communityId={id}
              onPress={() => router.push(`/community/${id}/post/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}
      {canCompose ? (
        <Pressable
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel={t('composePost')}
          onPress={() => router.push(`/community/${id}/compose`)}
        >
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F8FB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: '#3A4A60' },
  error: { color: '#C0392B', fontWeight: '600' },
  list: { paddingVertical: 8 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0B7BFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: -2 },
});
