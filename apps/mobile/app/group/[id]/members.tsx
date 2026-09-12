import { useGroupMembers } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupMemberRow, type GroupMember } from '@/components/group/GroupMemberRow';
import { colors } from '../../../theme';
import { EmptyState, emptyIcon, listEmptyContent, TopBar } from '../../../components/ui';

export default function GroupMembersScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: members, isLoading } = useGroupMembers(id);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const list = (members ?? []) as GroupMember[];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return list;
    return list.filter((m) => (m.profiles?.full_name ?? '').toLowerCase().includes(q));
  }, [members, query]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('membersTitle')} onBack={() => router.back()} backLabel={t('back')} />

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t('membersSearchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.foreground} />
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(m) => m.user_id}
          renderItem={({ item }) => <GroupMemberRow member={item} />}
          contentContainerStyle={listEmptyContent}
          ListEmptyComponent={
            <EmptyState
              fill
              icon={emptyIcon('person.2')}
              title={t('groupMembersEmptyTitle')}
              body={t('groupMembersEmptyBody')}
              // Ungated: the invite route is open to every group member, not just
              // an organizer/admin, and is already linked from the group detail
              // screen — there is no permission check to gate this CTA on.
              action={{ label: t('groupMembersEmptyCta'), onPress: () => router.push(`/group/${id}/invite` as never) }}
              testID="empty-group-members"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  searchWrap: { padding: 16 },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
});
