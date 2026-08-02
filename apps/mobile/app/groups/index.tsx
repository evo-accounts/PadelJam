import { useMyGroups, type MyGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../../theme';
import { Button, Chip, EmptyState, ListRow, Text } from '../../components/ui';

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
            <Button
              variant="ghost"
              size="sm"
              label={t('newGroupBtn')}
              onPress={() => router.push('/explore/groups' as never)}
            />
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
        <Text variant="body" tone="muted" style={styles.empty}>
          {t('loadError')}
        </Text>
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
          renderItem={({ item }) => (
            <ListRow
              variant="card"
              title={item.name}
              subtitle={item.community_name}
              trailing={
                <Text variant="caption" tone="muted">
                  {t('memberCount', { count: item.member_count })}
                </Text>
              }
              // Without this the count is not announced at all: ListRow sets an
              // accessibilityLabel, which makes the row a single element and
              // drops its children from the tree.
              trailingLabel={t('memberCount', { count: item.member_count })}
              onPress={() => router.push(`/group/${item.group_id}` as never)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted },
  // Only layout survives: `Text` carries the size and colour via variant/tone.
  empty: { textAlign: 'center', marginTop: 48 },
});
