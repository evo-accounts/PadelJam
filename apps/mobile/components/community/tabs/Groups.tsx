import { useCommunityGroups, useMayCreateGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { type Href, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useCommunityId } from '@/components/community/CommunityIdContext';
import { GroupCard } from '@/components/group/GroupCard';
import { colors } from '../../../theme';
import { Button, EmptyState, emptyIcon, listEmptyContent } from '../../ui';

export default function CommunityGroupsScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const id = useCommunityId();
  const { data: groups, isLoading, isError, refetch } = useCommunityGroups(id);
  // Permission only: at the plan's group limit the create answers with the upgrade prompt (decision 6).
  const { data: canCreate } = useMayCreateGroup(id);

  const createGroup = () => router.push(`/community/${id}/group-create` as Href);

  // UX-COMM-11: full-width at the top, only with permission. Was a hand-rolled
  // Pressable with its own radius and type; `Button fullWidth` is the same shape
  // in the primitive that owns it, and takes three literal sizes off the budget.
  const newGroupButton = canCreate ? (
    <Button label={t('createCta')} fullWidth onPress={createGroup} testID="community-create-group" />
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
              // Pinned above this empty state now, so not repeated inside it.
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
  separator: { height: 8 },
});
