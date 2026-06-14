import { useFollowing } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function FollowingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT('profile');
  const router = useRouter();
  const [search, setSearch] = useState('');
  const query = useFollowing(id, search);
  const rows = (query.data?.pages.flat() ?? []) as ReadonlyArray<{ id: string; full_name: string }>;
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('followingCount') }} />
      <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder={t('searchPlaceholder')} />
      <FlashList
        data={rows}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={<Text style={styles.empty}>{t('emptyFollowing')}</Text>}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  search: { margin: 16, marginBottom: 0, borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  row: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  empty: { textAlign: 'center', color: '#6B7685', paddingVertical: 24 },
});
