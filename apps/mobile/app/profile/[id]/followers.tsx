import { useFollowers } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../../theme';
import { EmptyState, emptyIcon, TopBar } from '../../../components/ui';

export default function FollowersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT('profile');
  const router = useRouter();
  const [search, setSearch] = useState('');
  const query = useFollowers(id, search);
  const rows = (query.data?.pages.flat() ?? []) as ReadonlyArray<{ id: string; full_name: string }>;
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('followersCount')} onBack={() => router.back()} />
      <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder={t('searchPlaceholder')} />
      <FlashList
        data={rows}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <EmptyState
            icon={emptyIcon('person.2')}
            title={t('emptyFollowers')}
            body={t('followersEmptyBody')}
            testID="empty-followers"
          />
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/profile/${item.id}`)} accessibilityRole="button">
            <Text style={styles.rowName}>{item.full_name}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: { margin: 16, marginBottom: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 16 },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.foreground },
});
