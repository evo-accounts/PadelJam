import { useGroupMembers, useRemoveGroupMember } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GroupMemberRow, type GroupMember } from '@/components/group/GroupMemberRow';

const KNOWN_ERROR_KEYS = new Set([
  'forbidden',
  'sole_owner_must_transfer',
  'sole_admin_must_add_another',
  'not_a_member',
]);

export default function GroupManageMembersScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: members, isLoading } = useGroupMembers(id);
  const remove = useRemoveGroupMember(id);

  const onRemove = (member: GroupMember) => {
    const name = member.profiles?.full_name ?? '—';
    Alert.alert(t('removeMemberConfirm', { name }), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('removeMemberCta'),
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(member.user_id);
          } catch (e) {
            const code = e instanceof Error ? e.message : 'unknown_error';
            Alert.alert(t('errorTitle'), t(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error'));
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#0B1F3A" />
      </View>
    );
  }

  const rows = (members ?? []) as GroupMember[];

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        keyExtractor={(m) => m.user_id}
        ListHeaderComponent={
          <Pressable
            style={styles.invite}
            accessibilityRole="button"
            onPress={() => router.push(`/group/${id}/invite` as Href)}
          >
            <Text style={styles.inviteText}>{t('inviteMembersCta')}</Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <GroupMemberRow
            member={item}
            trailing={
              item.user_id === uid ? null : (
                <Pressable onPress={() => onRemove(item)} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.remove}>{t('removeMemberCta')}</Text>
                </Pressable>
              )
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  invite: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EAF0',
  },
  inviteText: { fontSize: 16, fontWeight: '700', color: '#0B7BFF' },
  remove: { fontSize: 13, fontWeight: '600', color: '#c0392b' },
});
