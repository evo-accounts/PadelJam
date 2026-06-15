import { useMyGroups, type MyGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function YourGroupsScreen() {
  const { t } = useT('home');
  const router = useRouter();
  const groups = useMyGroups();
  const rows = groups.data ?? [];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('yourGroups') }} />
      {groups.isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 32 }} />
      ) : groups.isError ? (
        <Text style={styles.empty}>{t('loadError')}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('groupsEmpty')}</Text>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(g: MyGroup) => g.group_id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/group/${item.group_id}` as never)}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{item.community_name}</Text>
              </View>
              <Text style={styles.count}>{t('memberCount', { count: item.member_count })}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 12, padding: 14,
  },
  name: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  sub: { fontSize: 13, color: '#6B7685', marginTop: 2 },
  count: { fontSize: 13, color: '#6B7685' },
  empty: { textAlign: 'center', marginTop: 48, color: '#6B7685', fontSize: 15 },
});
