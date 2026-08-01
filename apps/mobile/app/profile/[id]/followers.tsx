import { useFollowers } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../../theme';

export default function FollowersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT('profile');
  const router = useRouter();
  const [search, setSearch] = useState('');
  const query = useFollowers(id, search);
  const rows = (query.data?.pages.flat() ?? []) as ReadonlyArray<{ id: string; full_name: string }>;
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('followersCount') }} />
      <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder={t('searchPlaceholder')} />
      <FlashList
        data={rows}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={<Text style={styles.empty}>{t('emptyFollowers')}</Text>}
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
  container: { flex: 1, backgroundColor: colors.background },
  search: { margin: 16, marginBottom: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 16 },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  empty: { textAlign: 'center', color: colors.mutedForeground, paddingVertical: 24 },
});
