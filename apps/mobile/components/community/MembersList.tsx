/**
 * The roster, shared by the Members tab and Manage Members (UX-COMM-19).
 *
 * The audit asks for "the same screen ... both share one component, the
 * difference being that everyone arriving here is an admin". In practice the
 * difference is smaller than that: what a row offers depends on whether the
 * VIEWER is an admin, not on which route they came through, so the rule is the
 * same on both and lives here once. Manage Members is this list under a TopBar.
 *
 * Row behaviour, from UX-COMM-20: an admin tapping any row but their own gets
 * the member-actions sheet; everyone else goes straight to the profile. Nobody
 * can act on themselves — leaving is a separate flow with its own last-admin
 * rules (UX-COMM-23).
 */
import {
  useAbility,
  useCommunity,
  useCommunityMembers,
  useCommunityRequests,
  useMakeAdmin,
  useRemoveAdmin,
  useRemoveMember,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { MemberRow, type CommunityMember } from '@/components/community/MemberRow';
import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { avatarUrl } from '@/lib/community-images';
import { colors, space } from '../../theme';
import {
  Avatar,
  Badge,
  EmptyState,
  emptyIcon,
  Field,
  ListRow,
  listEmptyContent,
  SwipeRow,
  Text,
  useActionSheet,
  useBanner,
} from '../ui';

/** Two roles since migration 0098; `owner` is tolerated only so an unmigrated row still sorts. */
const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 0, member: 1 };

/** Accent-insensitive, case-insensitive contains — "joao" must find "João". */
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function MembersList({ communityId: id }: { communityId: string }) {
  const { t } = useT('community');
  const router = useRouter();
  const uid = useSession().session?.user.id;

  const { data: members, isLoading, isError, refetch } = useCommunityMembers(id);
  const { data: community } = useCommunity(id);
  const { data: ability } = useAbility(id);
  const { data: requests } = useCommunityRequests(id);
  const [query, setQuery] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);

  const makeAdmin = useMakeAdmin(id);
  const removeAdmin = useRemoveAdmin(id);
  const removeMember = useRemoveMember(id);
  const show = useActionSheet();
  const banner = useBanner();

  const myRole = (members as CommunityMember[] | undefined)?.find((m) => m.user_id === uid)?.role;
  const canManage = myRole === 'admin';
  const busy = makeAdmin.isPending || removeAdmin.isPending || removeMember.isPending;

  // Ability is already scoped to this community; type-only check is sufficient.
  const canInvite = ability?.can('create', 'Member') ?? false;
  /**
   * The client mirror of `may_approve_requests` (migration 0099): an admin, or a
   * member holding the approve_join_requests toggle. Asking the ability rather
   * than the role is what lets a plain member with the permission see the queue
   * they are allowed to answer.
   */
  const canApprove = ability?.can('update', 'JoinRequest') ?? false;
  const pending = requests?.length ?? 0;

  /**
   * UX-COMM-21 shows this "when the community requires approval". The `pending > 0`
   * arm is UX-COMM-19's non-stranding rule: switching a community to public does
   * not withdraw the requests already queued, and without it those people wait for
   * an answer behind a row nobody can see any more. Manage Members inherits it by
   * sharing this component — which is the whole point of the merge.
   */
  const showRequests = canApprove && (community?.privacy === 'request_to_join' || pending > 0);

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(code, { defaultValue: t('unknown_error') }));
  };

  const onMakeAdmin = async (userId: string) => {
    try {
      await makeAdmin.mutateAsync(userId);
      banner.show(t('madeAdmin'), 'success');
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      if (code === 'co_organizers_limit_reached') {
        // Only actionable by someone who can change the plan — see UpgradePrompt.
        setShowUpgrade(true);
        return;
      }
      err(e);
    }
  };

  const openActions = async (member: CommunityMember) => {
    const name = member.profiles?.full_name ?? '—';
    const goProfile = () => router.push(`/profile/${member.user_id}`);

    // UX-COMM-20: a member tapping a row goes straight to the profile, and nobody
    // acts on their own row. With two roles there is no protected member left, so
    // every OTHER row is actionable; the last-admin guard (migration 0098) is what
    // refuses a demotion or removal that would orphan the community, surfaced
    // through err() like any other server code.
    if (!canManage || member.user_id === uid) return goProfile();

    // UX-GLOB-04: the member's avatar rides on the first action row (the sheet
    // title is plain text); the row label carries the name, so it is decorative.
    const avatar = (
      <Avatar
        name={name}
        uri={avatarUrl(member.profiles?.avatar_url)}
        colourKey={member.user_id}
        size="sm"
        decorative
      />
    );
    const key = await show({
      title: name,
      actions: [
        { key: 'profile', label: t('seeProfile'), leading: avatar },
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
    if (key === 'profile') goProfile();
    else if (key === 'makeAdmin') await onMakeAdmin(member.user_id);
    else if (key === 'removeAdmin') {
      try {
        await removeAdmin.mutateAsync(member.user_id);
      } catch (e) {
        err(e);
      }
    } else if (key === 'removeMember') {
      try {
        await removeMember.mutateAsync(member.user_id);
      } catch (e) {
        err(e);
      }
    }
  };

  const rows = useMemo(() => {
    const all = [...((members ?? []) as CommunityMember[])].sort(
      (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9),
    );
    const needle = fold(query.trim());
    if (!needle) return all;
    return all.filter((m) => fold(m.profiles?.full_name ?? '').includes(needle));
  }, [members, query]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      {/*
        Inline, not the global search screen of UX-GLOB-08 — the audit resolved
        that conflict in favour of a filter that lives with the list it filters.
      */}
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={t('memberSearchPlaceholder')}
        accessibilityLabel={t('memberSearchPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        testID="member-search"
      />
      {showRequests ? (
        <ListRow
          title={t('memberRequests')}
          variant="plain"
          onPress={() => router.push(`/community/${id}/manage/requests`)}
          trailing={pending > 0 ? <Badge label={String(pending)} /> : undefined}
          // The count is INFORMATION, not decoration: without this the row
          // collapses into one element and the number goes unannounced.
          trailingLabel={pending > 0 ? t('memberRequestsPending', { count: pending }) : undefined}
          testID="member-requests-entry"
        />
      ) : null}
      {canInvite ? (
        <ListRow
          title={t('inviteMember')}
          variant="plain"
          onPress={() => router.push(`/community/${id}/manage/invite`)}
          testID="invite-member-entry"
        />
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={listEmptyContent}
        ListHeaderComponent={header}
        ListEmptyComponent={
          isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError', { ns: 'common' })}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => refetch() }}
              testID="empty-members"
            />
          ) : query.trim() ? (
            // A search that matched nothing is not an empty community, and
            // offering "Invite" here would answer a question nobody asked.
            <View style={styles.noMatches}>
              <Text variant="body" tone="muted">
                {t('memberSearchNoMatches', { query: query.trim() })}
              </Text>
            </View>
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('person.2')}
              title={t('noMembers')}
              body={t('communityMembersEmptyBody')}
              // The invite entry is pinned in the header above, so it is not
              // repeated inside the empty state.
              testID="empty-members"
            />
          )
        }
        renderItem={({ item }) => {
          const row = (
            <MemberRow member={item} onPress={busy ? undefined : () => void openActions(item)} />
          );
          /*
            UX-COMM-19: "swiping a row exposes the same actions". One revealed
            button onto the same sheet rather than three behind the row — the
            sheet already decides what this viewer may do to this member, and
            duplicating that judgement into swipe targets would be a second
            place for the last-admin rule to be got wrong. Rows nobody can act
            on (your own, or any row when you are not an admin) do not swipe.
          */
          if (!canManage || item.user_id === uid) return row;
          return (
            <SwipeRow
              actionLabel={t('manageMember')}
              onAction={() => void openActions(item)}
              testID={`member-swipe-${item.user_id}`}
            >
              {row}
            </SwipeRow>
          );
        }}
      />
      <UpgradePrompt
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        communityId={id}
        message={t('upgradeCoOrganizersCap')}
        canManage={canManage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2] },
  noMatches: { padding: space[5], alignItems: 'center' },
});
