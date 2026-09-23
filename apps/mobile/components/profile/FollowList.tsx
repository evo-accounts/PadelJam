/**
 * The Followers and Following lists of UX-PROF-05 — one component for both.
 *
 * They were near-identical twins, differing only in which hook they called and which two copy keys
 * they used, and every change the audit asks for would otherwise have been made twice: the avatar,
 * the in-list follow control, the "⋯", the generic placeholder.
 *
 * The follow control shows the VIEWER's relationship with each row, not the list owner's. That is
 * what `is_following` / `is_followed_by` from migration 0102 are for — they are computed against
 * `auth.uid()`, so browsing somebody else's followers still says "Unfollow" next to the people you
 * already follow.
 */
import { useFollow, useFollowers, useFollowing, useUnfollow } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { useProfileActions } from './useProfileActions';
import { colors, space } from '../../theme';
import {
  Avatar,
  Button,
  EmptyState,
  IconButton,
  ListRow,
  SearchInput,
  TopBar,
  emptyIcon,
  listEmptyContent,
} from '../ui';

export function FollowList({ userId, kind }: { userId: string; kind: 'followers' | 'following' }) {
  const { t } = useT('profile');
  const router = useRouter();
  const [search, setSearch] = useState('');

  const followers = useFollowers(userId, search);
  const following = useFollowing(userId, search);
  const query = kind === 'followers' ? followers : following;
  const rows = query.data?.pages.flat() ?? [];

  const follow = useFollow();
  const unfollow = useUnfollow();
  const actions = useProfileActions();

  const copy =
    kind === 'followers'
      ? { title: t('followersCount'), empty: t('emptyFollowers'), body: t('followersEmptyBody') }
      : { title: t('followingCount'), empty: t('emptyFollowing'), body: t('followingEmptyBody') };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={copy.title} onBack={() => router.back()} />
      <SearchInput
        containerStyle={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder={t('searchPlaceholder')}
      />
      <FlashList
        data={rows}
        keyExtractor={(it) => it.id}
        contentContainerStyle={[{ padding: space[4] }, listEmptyContent]}
        ItemSeparatorComponent={() => <View style={{ height: space[2] }} />}
        ListEmptyComponent={
          // `query.isLoading` gates this so the empty card doesn't flash before the first page
          // arrives. A FAILED query is not an empty one: without this the user is told they have no
          // followers when the request actually errored, so the error takes precedence.
          query.isLoading ? null : query.isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError')}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => void query.refetch() }}
              testID={`error-${kind}`}
            />
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('person.2')}
              title={copy.empty}
              body={copy.body}
              testID={`empty-${kind}`}
            />
          )
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <ListRow
            variant="card"
            title={item.full_name}
            leading={
              <Avatar uri={avatarUrl(item.avatar_url)} name={item.full_name} colourKey={item.id} size="md" />
            }
            trailing={
              <View style={styles.rowActions}>
                <Button
                  size="sm"
                  variant={item.is_following ? 'outline' : 'primary'}
                  label={item.is_following ? t('kebabUnfollow') : t('kebabFollow')}
                  loading={follow.isPending || unfollow.isPending}
                  onPress={() =>
                    (item.is_following ? unfollow : follow).mutate(item.id)
                  }
                  testID={`follow-${item.id}`}
                />
                <IconButton
                  icon={
                    <SymbolView
                      name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' } as never}
                      tintColor={colors.foreground}
                      size={20}
                    />
                  }
                  accessibilityLabel={t('more')}
                  onPress={() =>
                    void actions.open({
                      id: item.id,
                      full_name: item.full_name,
                      is_following: item.is_following,
                    })
                  }
                  testID={`row-actions-${item.id}`}
                />
              </View>
            }
            onPress={() => router.push(`/profile/${item.id}`)}
          />
        )}
      />
      {actions.sheets}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: { margin: space[4], marginBottom: 0 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
});
