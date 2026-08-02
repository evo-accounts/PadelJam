import { useMyGroups, type MyGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { Chip } from '../../components/ui';

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
          <Chip
            key={k}
            label={t(k === 'all' ? 'tabAll' : k === 'managing' ? 'tabManaging' : 'tabParticipating')}
            selected={tab === k}
            onPress={() => setTab(k)}
          />
        ))}
      </View>
      {groups.isLoading ? (
        <ActivityIndicator color={colors.foreground} style={{ marginTop: 32 }} />
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
  container: { flex: 1, backgroundColor: colors.background },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, marginHorizontal: 12, marginTop: 8, borderRadius: 12, padding: 14,
  },
  name: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  sub: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  count: { fontSize: 13, color: colors.mutedForeground },
  empty: { textAlign: 'center', marginTop: 48, color: colors.mutedForeground, fontSize: 15 },
  emptyCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 24,
    alignItems: 'center', gap: 12, margin: 16,
  },
  emptyCardText: { fontSize: 14, color: colors.mutedForeground, textAlign: 'center' },
  emptyCardBtn: {
    backgroundColor: colors.primary, borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  emptyCardBtnText: { color: colors.card, fontWeight: '700', fontSize: 14 },
  headerBtn: { color: colors.primary, fontWeight: '700', fontSize: 15 },
});
