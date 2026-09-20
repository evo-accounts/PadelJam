/**
 * The two header menus of UX-COMM-14 and UX-COMM-15.
 *
 * One hook because they overlap: Share, Copy link and Leave are in both, and an
 * admin's menu is the member's plus the administration rows. It returns a
 * single `TopBar` action ("⚙" for an admin, "⋯" for a member) or null, so the
 * header stays declarative.
 *
 * TWO DELIBERATE DEPARTURES FROM THE AUDIT, both because the audit predates the
 * five-tab restructure (#142):
 *
 *   - the member menu has no "Community details" row. That was a way into a
 *     read-only view of the community back when the tab pushed into one; About
 *     is now a tab in the strip directly above this menu. A row here would also
 *     have to navigate to `/community/about`, which collides with the dynamic
 *     `/community/[id]` route.
 *   - the admin menu adds "Community plan", which the audit does not list. The
 *     plan section lives on the manage screen, and with the rest of that screen
 *     replaced by this menu it would otherwise be reachable only from
 *     `UpgradePrompt`'s deep link.
 *
 * "Manage groups" arrived with plan PR 9, which built the screen it opens.
 */
import {
  useArchiveCommunity,
  useArchivedCommunityGroups,
  useCommunityGroups,
  useCommunityMembers,
  useLeaveCommunity,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';

import { useActionSheet, useBanner, useConfirm } from '@/components/ui';
import { copyCommunityLink, shareCommunity } from '@/lib/communityShare';

export type CommunityMenuTarget = {
  id: string;
  name: string;
  privacy: string | null;
  archivedAt: string | null;
};

export type CommunityMenuAction = { icon: string; label: string; onPress: () => void };

export function useCommunityMenu(
  target: CommunityMenuTarget | null,
  isAdmin: boolean,
): CommunityMenuAction | null {
  const { t } = useT('community');
  const router = useRouter();
  const show = useActionSheet();
  const confirm = useConfirm();
  const banner = useBanner();
  const uid = useSession().session?.user.id;
  // UX-COMM-23 checks standing BEFORE asking anything, and UX-COMM-24's two
  // confirmations have to state a count, so both need their data in hand by the
  // time the row is tapped rather than after the mutation has answered.
  const { data: members } = useCommunityMembers(target?.id);
  const { data: liveGroups } = useCommunityGroups(target?.id ?? '');
  const { data: archivedGroups } = useArchivedCommunityGroups(target?.id ?? '');
  // Both mutations close over the id only inside their mutationFn, so the empty
  // fallback is never the one that runs: no menu is rendered without a target.
  const archive = useArchiveCommunity(target?.id ?? '');
  const leave = useLeaveCommunity();

  if (!target) return null;

  const { id, name } = target;
  const isArchived = !!target.archivedAt;

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(code, { defaultValue: t('unknown_error') }));
  };

  const go = (path: string) => router.push(path as never);

  const onShare = async () => {
    try {
      await shareCommunity(id, name);
    } catch (e) {
      err(e);
    }
  };

  const onCopy = async () => {
    await copyCommunityLink(id);
    banner.show(t('linkCopied'), 'success');
  };

  const doArchive = async (archiving: boolean) => {
    try {
      const groupCount = await archive.mutateAsync(archiving);
      banner.show(
        `${t(archiving ? 'archivedTitle' : 'unarchivedTitle')} ${t('archiveResult', { count: (groupCount as number) ?? 0 })}`,
        'success',
      );
    } catch (e) {
      err(e);
    }
  };

  const onArchive = async () => {
    const archiving = !isArchived;
    // UX-COMM-24: the confirmation says how many groups travel with it. Counted
    // BEFORE the call, from the lists already cached for Manage Groups — the
    // mutation only reports the number afterwards, which is too late to ask
    // with. Always at least one, since every community has its general group.
    const count = archiving ? (liveGroups?.length ?? 0) : (archivedGroups?.length ?? 0);
    const ok = await confirm({
      title: archiving ? t('archiveConfirmTitle') : t('unarchiveConfirmTitle'),
      body: archiving ? t('archiveConfirmBody', { count }) : t('unarchiveConfirmBody', { count }),
      confirmLabel: archiving ? t('archive') : t('unarchive'),
      cancelLabel: t('cancel'),
      destructive: archiving,
    });
    if (ok) await doArchive(archiving);
  };

  /**
   * UX-COMM-23: check standing FIRST, so a last admin is offered a way forward
   * instead of being asked to confirm and then refused. This does not replace
   * the server rule — 0098's `trg_last_admin` still raises
   * `last_admin_must_promote_first`, and the final branch below still surfaces
   * it — it just stops that refusal being the FIRST thing the user hears.
   *
   * A roster still loading reads as empty, which falls through to the ordinary
   * confirmation and lets the server answer. That is the safe way round: the
   * worst case is the old behaviour, not a leave that should have been blocked.
   */
  const onLeave = async () => {
    const roster = (members ?? []) as { user_id: string; role: string }[];
    const iAmAdmin = roster.find((m) => m.user_id === uid)?.role === 'admin';
    const otherAdmins = roster.filter((m) => m.role === 'admin' && m.user_id !== uid).length;
    const others = roster.filter((m) => m.user_id !== uid).length;
    const lastAdmin = iAmAdmin && otherAdmins === 0;

    if (lastAdmin && others > 0) {
      // Never an error: a route to the fix, with Cancel as the way out.
      const goPromote = await confirm({
        title: t('leavePromoteFirstTitle'),
        body: t('leavePromoteFirstBody'),
        confirmLabel: t('goToMembers'),
        cancelLabel: t('cancel'),
      });
      if (goPromote) go(`/community/${id}/manage/members`);
      return;
    }

    if (lastAdmin) {
      // Nobody to promote to, so leaving would strand the community. Archiving
      // is the thing they can actually do, offered in place of the refusal.
      const ok = await confirm({
        title: t('leaveNobodyTitle'),
        body: t('leaveNobodyBody'),
        confirmLabel: t('archive'),
        cancelLabel: t('cancel'),
        destructive: true,
      });
      if (ok) await doArchive(true);
      return;
    }

    const ok = await confirm({
      title: t('leaveConfirmTitle'),
      body: t('leaveConfirmBody'),
      confirmLabel: t('leave'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await leave.mutateAsync(id);
      // The switcher falls back to another membership; there is nothing to pop,
      // since this menu lives in a tab rather than on a pushed screen.
      router.replace('/');
    } catch (e) {
      err(e);
    }
  };

  const share = { key: 'share', label: t('shareCommunity') };
  const copy = { key: 'copy', label: t('copyLink') };
  const leaveRow = {
    key: 'leave',
    label: t('leave'),
    destructive: true,
    // onLeave decides WHICH question to ask, after reading the roster.
    selfConfirm: true,
  };

  const adminRows = [
    { key: 'settings', label: t('manageSettings') },
    { key: 'permissions', label: t('managePermissions') },
    { key: 'members', label: t('manageMembers') },
    { key: 'groups', label: t('manageGroups') },
    ...(target.privacy === 'request_to_join' ? [{ key: 'requests', label: t('manageRequests') }] : []),
    { key: 'plan', label: t('managePlan') },
    share,
    copy,
    {
      key: 'archive',
      label: isArchived ? t('unarchive') : t('archive'),
      // Archiving takes the community away from everyone in it; restoring it does not.
      destructive: !isArchived,
      // onArchive asks, because the question carries a group count.
      selfConfirm: true,
    },
    leaveRow,
  ];

  const run = async (actions: typeof adminRows) => {
    const key = await show({ title: name, actions });
    switch (key) {
      case 'settings':
        return go(`/community/${id}/manage/settings`);
      case 'permissions':
        return go(`/community/${id}/manage/permissions`);
      case 'members':
        return go(`/community/${id}/manage/members`);
      case 'groups':
        return go(`/community/${id}/manage/groups`);
      case 'requests':
        return go(`/community/${id}/manage/requests`);
      case 'plan':
        return go(`/community/${id}/manage?section=plan`);
      case 'share':
        return void onShare();
      case 'copy':
        return void onCopy();
      case 'archive':
        return void onArchive();
      case 'leave':
        return void onLeave();
      default:
        return undefined;
    }
  };

  return isAdmin
    ? { icon: '⚙', label: t('manageTitle'), onPress: () => void run(adminRows) }
    : { icon: '⋯', label: t('moreActions'), onPress: () => void run([share, copy, leaveRow]) };
}
