import { useGroupMembers, useRemoveGroupMember } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupMemberRow, type GroupMember } from '@/components/group/GroupMemberRow';
import { colors } from '../../../../theme';
import { TopBar, useBanner, useConfirm } from '../../../../components/ui';

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
  const confirm = useConfirm();
  const banner = useBanner();

  const onRemove = async (member: GroupMember) => {
    const name = member.profiles?.full_name ?? '—';
    const ok = await confirm({
      title: t('removeMemberConfirm', { name }),
      confirmLabel: t('removeMemberCta'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(member.user_id);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error'));
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  const rows = (members ?? []) as GroupMember[];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('membersTitle')} onBack={() => router.back()} backLabel={t('back')} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center' },
  invite: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  inviteText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  remove: { fontSize: 13, fontWeight: '600', color: colors.destructive },
});
