import {
  useCommunityMembers,
  useMakeAdmin,
  useRemoveAdmin,
  useRemoveMember,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemberRow, type CommunityMember } from '@/components/community/MemberRow';
import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { colors, palette } from '../../../../theme';
import {
  EmptyState,
  emptyIcon,
  listEmptyContent,
  TopBar,
  useActionSheet,
  useBanner,
} from '../../../../components/ui';

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

export default function ManageMembersScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: members, isLoading, isError, refetch } = useCommunityMembers(id);
  const makeAdmin = useMakeAdmin(id);
  const removeAdmin = useRemoveAdmin(id);
  const removeMember = useRemoveMember(id);
  const show = useActionSheet();
  const banner = useBanner();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const myRole = (members as CommunityMember[] | undefined)?.find((m) => m.user_id === uid)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';
  const busy = makeAdmin.isPending || removeAdmin.isPending || removeMember.isPending;

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(code, { defaultValue: t('unknown_error') }));
  };

  const onMakeAdmin = async (userId: string) => {
    try {
      await makeAdmin.mutateAsync(userId);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      if (code === 'co_organizers_limit_reached') {
        // Only actionable from here by an owner/admin (canManage above), who can
        // act on the community's plan — see UpgradePrompt.
        setShowUpgrade(true);
        return;
      }
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

  const onRemoveMember = async (member: CommunityMember) => {
    try {
      await removeMember.mutateAsync(member.user_id);
    } catch (e) {
      err(e);
    }
  };

  const openActions = async (member: CommunityMember) => {
    // Owner row has no destructive actions; you can't act on yourself.
    if (!canManage || member.role === 'owner' || member.user_id === uid) return;
    const name = member.profiles?.full_name ?? '—';

    // UX-GLOB-04: this sheet should show the member's Avatar next to `name`
    // in the title. `ActionSheetOptions.title` (components/ui/sheetApi.ts) is
    // a plain string and `SheetAction` has no `leading` slot — SheetHost maps
    // actions straight to `SheetRow` without ever reading one — so a node
    // can't reach the sheet through this API today. Adding it means changing
    // the shared sheet primitive (sheetApi.ts + SheetHost.tsx), which is out
    // of scope for this screen; flagged as a follow-up instead of widening
    // scope here.
    const key = await show({
      title: name,
      actions: [
        member.role === 'admin'
          ? { key: 'removeAdmin', label: t('removeAdmin') }
          : { key: 'makeAdmin', label: t('makeAdmin') },
        {
          key: 'removeMember',
          label: t('removeMember'),
          destructive: true,
          confirm: {
            title: t('removeMemberConfirmTitle'),
            body: t('removeMemberConfirmBody', { name }),
            confirmLabel: t('removeMember'),
          },
        },
      ],
    });
    if (key === 'makeAdmin') await onMakeAdmin(member.user_id);
    else if (key === 'removeAdmin') await onRemoveAdmin(member.user_id);
    else if (key === 'removeMember') await onRemoveMember(member);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  const rows = [...((members ?? []) as CommunityMember[])].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9),
  );

  const actionable = (m: CommunityMember) =>
    canManage && m.role !== 'owner' && m.user_id !== uid;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('manageMembers')} onBack={() => router.back()} backLabel={t('back')} />
      <FlashList
        data={rows}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={listEmptyContent}
        ListEmptyComponent={
          isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError', { ns: 'common' })}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => refetch() }}
              testID="empty-manage-members"
            />
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('person.2')}
              title={t('noMembers')}
              body={t('communityMembersEmptyBody')}
              action={
                canManage
                  ? {
                      label: t('communityMembersEmptyCta'),
                      onPress: () => router.push(`/community/${id}/manage/invite`),
                    }
                  : undefined
              }
              testID="empty-manage-members"
            />
          )
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
      <UpgradePrompt
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        communityId={id}
        message={t('upgradeCoOrganizersCap')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  rowWrap: { flexDirection: 'row', alignItems: 'center' },
  rowFill: { flex: 1 },
  dots: { fontSize: 24, color: palette.slate[400], paddingHorizontal: 16 },
});
