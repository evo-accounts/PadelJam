import { useCanCreateGroup, useCommunityGroups } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { type Href, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCommunityId } from '@/components/community/CommunityIdContext';
import { GroupCard } from '@/components/group/GroupCard';
import { colors } from '../../../theme';
import { EmptyState, emptyIcon, listEmptyContent } from '../../ui';

export default function CommunityGroupsScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const id = useCommunityId();
  const { data: groups, isLoading, isError, refetch } = useCommunityGroups(id);
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
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  const rows = groups ?? [];

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        keyExtractor={(g) => g.id}
        contentContainerStyle={[styles.listContent, listEmptyContent]}
        ListHeaderComponent={newGroupButton ? <View style={styles.header}>{newGroupButton}</View> : null}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <GroupCard group={item} onPress={() => router.push(`/group/${item.id}` as Href)} />
        )}
        ListEmptyComponent={
          isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError', { ns: 'common' })}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => refetch() }}
              testID="empty-groups"
            />
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('person.3')}
              title={t('emptyAll')}
              body={t('communityGroupsEmptyBody')}
              action={
                canCreate
                  ? {
                      label: t('communityGroupsEmptyCta'),
                      onPress: () => router.push(`/community/${id}/group-create` as Href),
                    }
                  : undefined
              }
              testID="empty-groups"
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  listContent: { paddingHorizontal: 12, paddingVertical: 8 },
  header: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  newButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  newButtonText: { color: colors.card, fontSize: 15, fontWeight: '700' },
  separator: { height: 8 },
});
