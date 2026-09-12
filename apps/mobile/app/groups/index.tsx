import { useMyGroups, type MyGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GroupCard } from '@/components/group/GroupCard';
import { colors } from '../../theme';
import { Chip, EmptyState, TopBar } from '../../components/ui';

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        // "My Groups", per the audit. The key already existed with exactly
        // that copy; the screen was simply using the wrong one.
        title={t('myGroups')}
        onBack={() => router.back()}
        actions={[{ icon: '+', label: t('newGroupBtn'), onPress: () => router.push('/explore/groups' as never) }]}
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
        <EmptyState
          tone="error"
          title={t('loadError')}
          action={{ label: t('retry', { ns: 'common' }), onPress: () => groups.refetch() }}
          testID="empty-groups"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('groupsEmpty')}
          action={{
            label: t('newGroupBtn'),
            onPress: () => router.push('/explore/groups' as never),
          }}
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(g: MyGroup) => g.group_id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            // `my_groups` (an RPC, not a plain select) doesn't return the
            // thumbnail/is_private/is_general/archived_at columns GroupCard's
            // badge affordances use — same loose-cast the explore list already
            // takes for this reason. `community_name` IS on `MyGroup`, and the
            // merged card renders it as a second line for exactly this screen
            // (a list that spans communities) — so nothing here is lost.
            <GroupCard
              group={item as never}
              memberCount={item.member_count}
              orientation="horizontal"
              onPress={() => router.push(`/group/${item.group_id}` as never)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted },
  list: { padding: 16 },
});
