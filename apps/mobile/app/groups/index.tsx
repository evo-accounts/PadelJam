import { useMyGroups, type MyGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function YourGroupsScreen() {
  const { t } = useT('home');
  const router = useRouter();
  const groups = useMyGroups();
  const [tab, setTab] = useState<'all' | 'managing' | 'participating'>('all');
  const all = groups.data ?? [];
  const rows =
    tab === 'managing' ? all.filter((g) => g.is_managing)
    : tab === 'participating' ? all.filter((g) => !g.is_managing)
    : all;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('yourGroups'),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/explore/groups' as never)}
              accessibilityRole="button"
              hitSlop={12}
              style={{ paddingHorizontal: 8 }}
            >
              <Text style={styles.headerBtn}>{t('newGroupBtn')}</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.tabs}>
        {(['all', 'managing', 'participating'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabActive]} accessibilityRole="button">
            <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>
              {t(k === 'all' ? 'tabAll' : k === 'managing' ? 'tabManaging' : 'tabParticipating')}
            </Text>
          </Pressable>
        ))}
      </View>
      {groups.isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 32 }} />
      ) : groups.isError ? (
        <Text style={styles.empty}>{t('loadError')}</Text>
      ) : rows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>{t('groupsEmpty')}</Text>
          <Pressable
            style={styles.emptyCardBtn}
            onPress={() => router.push('/explore/groups' as never)}
            accessibilityRole="button"
          >
            <Text style={styles.emptyCardBtnText}>{t('newGroupBtn')}</Text>
          </Pressable>
        </View>
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
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#0B7BFF' },
  tabText: { fontSize: 14, color: '#6B7685', fontWeight: '600' },
  tabTextActive: { color: '#0B7BFF', fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 12, padding: 14,
  },
  name: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  sub: { fontSize: 13, color: '#6B7685', marginTop: 2 },
  count: { fontSize: 13, color: '#6B7685' },
  empty: { textAlign: 'center', marginTop: 48, color: '#6B7685', fontSize: 15 },
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 24,
    alignItems: 'center', gap: 12, margin: 16,
  },
  emptyCardText: { fontSize: 14, color: '#6B7685', textAlign: 'center' },
  emptyCardBtn: {
    backgroundColor: '#0B7BFF', borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  emptyCardBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  headerBtn: { color: '#0B7BFF', fontWeight: '700', fontSize: 15 },
});
