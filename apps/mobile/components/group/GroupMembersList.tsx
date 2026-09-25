/**
 * The one members screen (UX-GRP-07), reached from the group page's members line and — for
 * admins — from Manage Group's "Manage members" (UX-GRP-12). Both paths render this component, so
 * the two screens can no longer drift apart.
 *
 *   - Search at the top; "Invite member" below it, full width, only for whoever may invite.
 *   - Rows: photo, name, chevron. Someone who has left stays listed, greyscale, with a
 *     "No longer in group" tag (decision 2) — their history is still the group's history.
 *   - An admin's tap opens the member actions sheet (UX-GRP-13): See profile, Remove from group.
 *     There is no "Make admin": admin rights are community-level (UX-COMM-20). Everyone else's tap
 *     opens the profile directly.
 *   - An admin can also swipe a current member's row to "Remove from group" — the same action as
 *     the sheet's, never the only way to it (SwipeRow's rule).
 *
 * Removing is from THIS group only; the person stays in the community (UX-GRP-13).
 */
import {
  useCanInviteToGroup,
  useCommunityMembers,
  useGroup,
  useGroupMemberList,
  useRemoveGroupMember,
  type GroupMemberListRow,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';

import { colors, radius, space } from '../../theme';
import {
  Avatar,
  Badge,
  EmptyState,
  SearchInput,
  SwipeRow,
  Text,
  TopBar,
  emptyIcon,
  listEmptyContent,
  useActionSheet,
  useBanner,
  useConfirm,
} from '../ui';

export function GroupMembersList({ groupId }: { groupId: string }) {
  const { t } = useT('group');
  const router = useRouter();
  const goBack = useGoBack();
  const uid = useSession().session?.user.id;
  const show = useActionSheet();
  const confirm = useConfirm();
  const banner = useBanner();

  const { data: group } = useGroup(groupId);
  const { data: people, isLoading, isError, refetch } = useGroupMemberList(groupId);
  const { data: communityMembers } = useCommunityMembers(group?.community_id);
  const { data: canInvite } = useCanInviteToGroup(groupId);
  const remove = useRemoveGroupMember(groupId);
  const [query, setQuery] = useState('');

  const isMember = (people ?? []).some((p) => p.user_id === uid && p.is_member);
  const isCommunityAdmin = (communityMembers ?? []).some((m) => m.user_id === uid && m.role === 'admin');
  const isAdmin = isCommunityAdmin && (!group?.is_private || isMember);
  const isArchived = !!group?.archived_at;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = people ?? [];
    return q.length === 0 ? list : list.filter((p) => (p.full_name ?? '').toLowerCase().includes(q));
  }, [people, query]);

  const openProfile = (userId: string) => router.push(`/profile/${userId}` as Href);

  const removeMember = async (p: GroupMemberListRow) => {
    const name = p.full_name ?? '—';
    const ok = await confirm({
      title: t('removeMemberConfirm', { name }),
      body: t('removeMemberConfirmBody'),
      confirmLabel: t('removeMemberCta'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(p.user_id);
      banner.show(t('removedToast', { name }), 'success');
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  const openActions = async (p: GroupMemberListRow) => {
    const name = p.full_name ?? '—';
    const key = await show({
      title: name,
      actions: [
        {
          key: 'profile',
          label: t('seeProfile'),
          leading: <Avatar uri={avatarUrl(p.avatar_url)} name={name} colourKey={p.user_id} size="sm" decorative />,
        },
        // removeMember asks, because its confirmation names the person.
        { key: 'remove', label: t('removeMemberCta'), destructive: true, selfConfirm: true },
      ],
    });
    if (key === 'profile') openProfile(p.user_id);
    else if (key === 'remove') await removeMember(p);
  };

  // Admins act on current members other than themselves; everything else is a profile link.
  const manageable = (p: GroupMemberListRow) => isAdmin && !isArchived && p.is_member && p.user_id !== uid;

  const renderRow = (p: GroupMemberListRow) => {
    const name = p.full_name ?? '—';
    const row = (
      <Pressable
        style={styles.row}
        onPress={() => (manageable(p) ? void openActions(p) : openProfile(p.user_id))}
        accessibilityRole="button"
        accessibilityLabel={p.is_member ? name : `${name}, ${t('departedTag')}`}
        testID={`group-member-${p.user_id}`}
      >
        <Avatar
          uri={avatarUrl(p.avatar_url)}
          name={name}
          colourKey={p.user_id}
          size="md"
          decorative
          greyscale={!p.is_member}
        />
        <View style={styles.text}>
          <Text variant="label" tone={p.is_member ? 'default' : 'muted'} numberOfLines={1}>
            {name}
          </Text>
          {p.is_member ? null : <Badge label={t('departedTag')} style={styles.tag} />}
        </View>
        <Text variant="body" tone="subtle">
          ›
        </Text>
      </Pressable>
    );
    return manageable(p) ? (
      <SwipeRow actionLabel={t('removeMemberCta')} onAction={() => void removeMember(p)} destructive testID={`group-member-swipe-${p.user_id}`}>
        {row}
      </SwipeRow>
    ) : (
      row
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('membersTitle')} onBack={goBack} backLabel={t('back')} />
      <SearchInput
        containerStyle={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder={t('membersSearchPlaceholder')}
      />
      {canInvite && !isArchived ? (
        <Pressable
          style={styles.invite}
          accessibilityRole="button"
          onPress={() => router.push(`/group/${groupId}/invite` as Href)}
          testID="group-members-invite"
        >
          <Text variant="label" tone="primary">
            {t('inviteMemberRow')}
          </Text>
        </Pressable>
      ) : null}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.foreground} />
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(p) => p.user_id}
          renderItem={({ item }) => renderRow(item)}
          contentContainerStyle={listEmptyContent}
          ListEmptyComponent={
            // A failed load is not an empty group.
            isError ? (
              <EmptyState
                fill
                tone="error"
                title={t('loadError')}
                action={{ label: t('retry', { ns: 'common' }), onPress: () => void refetch() }}
                testID="error-group-members"
              />
            ) : (
              <EmptyState
                fill
                icon={emptyIcon(query ? 'magnifyingglass' : 'person.2')}
                title={query ? t('membersNoMatch') : t('groupMembersEmptyTitle')}
                testID="empty-group-members"
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: { marginHorizontal: space[4], marginTop: space[3] },
  invite: {
    marginHorizontal: space[4],
    marginTop: space[3],
    paddingVertical: space[3],
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.full,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: space[8] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    backgroundColor: colors.background,
  },
  text: { flex: 1, alignItems: 'flex-start' },
  tag: { marginTop: space[1] },
});
