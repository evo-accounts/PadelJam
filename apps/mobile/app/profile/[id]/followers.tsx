import { useFollowers } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { colors } from '../../../theme';
import { Avatar, EmptyState, ListRow, SearchInput, emptyIcon, listEmptyContent, TopBar } from '../../../components/ui';

export default function FollowersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT('profile');
  const router = useRouter();
  const [search, setSearch] = useState('');
  const query = useFollowers(id, search);
  const rows = query.data?.pages.flat() ?? [];
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('followersCount')} onBack={() => router.back()} />
      <SearchInput containerStyle={styles.search} value={search} onChangeText={setSearch} placeholder={t('searchPlaceholder')} />
      <FlashList
        data={rows}
        keyExtractor={(it) => it.id}
        contentContainerStyle={[{ padding: 16 }, listEmptyContent]}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          // `query.isLoading` gates this so the empty card doesn't flash before
          // the first page of followers arrives. A FAILED query is not an empty one:
          // without this the user is told they have no followers when the request
          // actually errored, so the error takes precedence over the empty copy.
          query.isLoading ? null : query.isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError')}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => void query.refetch() }}
              testID="error-followers"
            />
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('person.2')}
              title={t('emptyFollowers')}
              body={t('followersEmptyBody')}
              testID="empty-followers"
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
            onPress={() => router.push(`/profile/${item.id}`)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: { margin: 16, marginBottom: 0 },
});
