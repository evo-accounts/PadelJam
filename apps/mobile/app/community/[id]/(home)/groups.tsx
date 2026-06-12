import { useCanCreateGroup, useCommunityGroups } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GroupCard } from '@/components/group/GroupCard';

export default function CommunityGroupsScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: groups, isLoading } = useCommunityGroups(id);
  const { data: canCreate } = useCanCreateGroup(id);

  const newGroupButton = canCreate ? (
    <Pressable
      style={styles.newButton}
      onPress={() => router.push(`/community/${id}/group-create` as Href)}
      accessibilityRole="button"
    >
      <Text style={styles.newButtonText}>+ {t('newGroupCta')}</Text>
    </Pressable>
  ) : null;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#0B1F3A" />
      </View>
    );
  }

  const rows = groups ?? [];

  if (rows.length === 0) {
    return (
      <View style={styles.container}>
        {newGroupButton ? <View style={styles.header}>{newGroupButton}</View> : null}
        <View style={styles.center}>
          <Text style={styles.empty}>{t('emptyAll')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={newGroupButton ? <View style={styles.header}>{newGroupButton}</View> : null}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <GroupCard group={item} onPress={() => router.push(`/group/${item.id}` as Href)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: '#3A4A60' },
  listContent: { paddingHorizontal: 12, paddingVertical: 8 },
  header: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  newButton: {
    backgroundColor: '#0B1F3A',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  newButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  separator: { height: 8 },
});
