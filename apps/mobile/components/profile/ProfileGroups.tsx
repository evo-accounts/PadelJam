/**
 * The Groups section of UX-PROF-01.
 *
 * What it shows depends on whose profile it is, and the rule lives in the database rather than
 * here: `my_groups(p_user)` (migration 0102) returns everything for yourself, and for anyone else
 * only groups in communities you BOTH belong to, never private ones. The screen does not get to
 * decide that, because the function is `security definer` and the client is not a fence.
 *
 * Horizontal cards, per UX-GLOB-09: this is a list, not a rail.
 */
import { usePlayerGroups } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { space } from '../../theme';
import { GroupCard } from '../group/GroupCard';
import { EmptyState, emptyIcon } from '../ui';

export function ProfileGroups({ userId }: { userId: string }) {
  const { t } = useT('profile');
  const router = useRouter();
  const query = usePlayerGroups(userId);
  const groups = query.data ?? [];

  if (query.isLoading) return null;

  if (groups.length === 0) {
    return <EmptyState icon={emptyIcon('person.3')} title={t('groupsEmpty')} testID="empty-profile-groups" />;
  }

  return (
    <View style={styles.list}>
      {groups.map((g) => (
        <GroupCard
          key={g.group_id}
          group={{ id: g.group_id, name: g.name, community_name: g.community_name }}
          memberCount={g.member_count ?? undefined}
          orientation="horizontal"
          onPress={() => router.push(`/group/${g.group_id}`)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[2] },
});
