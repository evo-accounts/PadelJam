import {
  useCommunityMembers,
  useMakeAdmin,
  useRemoveAdmin,
  useRemoveMember,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { MemberRow, type CommunityMember } from '@/components/community/MemberRow';
import { colors, palette } from '../../../../theme';

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

export default function ManageMembersScreen() {
  const { t } = useT('community');
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: members, isLoading } = useCommunityMembers(id);
  const makeAdmin = useMakeAdmin(id);
  const removeAdmin = useRemoveAdmin(id);
  const removeMember = useRemoveMember(id);

  const myRole = (members as CommunityMember[] | undefined)?.find((m) => m.user_id === uid)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';
  const busy = makeAdmin.isPending || removeAdmin.isPending || removeMember.isPending;

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    Alert.alert(t('errorTitle'), t(code, { defaultValue: t('unknown_error') }));
  };

  const onMakeAdmin = async (userId: string) => {
    try {
      await makeAdmin.mutateAsync(userId);
    } catch (e) {
      err(e);
    }
  };

  const onRemoveAdmin = async (userId: string) => {
    try {
      await removeAdmin.mutateAsync(userId);
    } catch (e) {
      err(e);
    }
  };

  const onRemoveMember = (member: CommunityMember) => {
    Alert.alert(
      t('removeMemberConfirmTitle'),
      t('removeMemberConfirmBody', { name: member.profiles?.full_name ?? '—' }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('removeMember'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember.mutateAsync(member.user_id);
            } catch (e) {
              err(e);
            }
          },
        },
      ],
    );
  };

  const openActions = (member: CommunityMember) => {
    // Owner row has no destructive actions; you can't act on yourself.
    if (!canManage || member.role === 'owner' || member.user_id === uid) return;

    const options: { text: string; style?: 'default' | 'destructive'; onPress: () => void }[] = [];
    if (member.role === 'admin') {
      options.push({ text: t('removeAdmin'), onPress: () => onRemoveAdmin(member.user_id) });
    } else {
      options.push({ text: t('makeAdmin'), onPress: () => onMakeAdmin(member.user_id) });
    }
    options.push({
      text: t('removeMember'),
      style: 'destructive',
      onPress: () => onRemoveMember(member),
    });

    Alert.alert(member.profiles?.full_name ?? '—', undefined, [
      ...options.map((o) => ({ text: o.text, style: o.style, onPress: o.onPress })),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  const rows = [...((members ?? []) as CommunityMember[])].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9),
  );

  const actionable = (m: CommunityMember) =>
    canManage && m.role !== 'owner' && m.user_id !== uid;

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        keyExtractor={(m) => m.user_id}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>{t('noMembers')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openActions(item)}
            disabled={!actionable(item) || busy}
            android_ripple={actionable(item) ? { color: colors.muted } : undefined}
          >
            <View style={styles.rowWrap}>
              <View style={styles.rowFill}>
                <MemberRow member={item} />
              </View>
              {actionable(item) ? <Text style={styles.dots}>⋯</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: colors.mutedForeground },
  rowWrap: { flexDirection: 'row', alignItems: 'center' },
  rowFill: { flex: 1 },
  dots: { fontSize: 24, color: palette.slate[400], paddingHorizontal: 16 },
});
