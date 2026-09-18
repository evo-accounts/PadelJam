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
 * "Manage groups" is absent because the screen does not exist yet; plan PR 9
 * builds it and adds the row.
 */
import { useArchiveCommunity, useLeaveCommunity } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';

import { useActionSheet, useBanner } from '@/components/ui';
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
  const banner = useBanner();
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

  const onArchive = async () => {
    try {
      const groupCount = await archive.mutateAsync(!isArchived);
      banner.show(
        `${t(isArchived ? 'unarchivedTitle' : 'archivedTitle')} ${t('archiveResult', { count: (groupCount as number) ?? 0 })}`,
        'success',
      );
    } catch (e) {
      err(e);
    }
  };

  const onLeave = async () => {
    try {
      await leave.mutateAsync(id);
      // The switcher falls back to another membership; there is nothing to pop,
      // since this menu lives in a tab rather than on a pushed screen.
      router.replace('/');
    } catch (e) {
      // The last-admin guard (migration 0098) raises 'last_admin_must_promote_first',
      // which resolves through the same i18n lookup as every other code.
      err(e);
    }
  };

  const share = { key: 'share', label: t('shareCommunity') };
  const copy = { key: 'copy', label: t('copyLink') };
  const leaveRow = {
    key: 'leave',
    label: t('leave'),
    destructive: true,
    confirm: {
      title: t('leaveConfirmTitle'),
      body: t('leaveConfirmBody'),
      confirmLabel: t('leave'),
    },
  };

  const adminRows = [
    { key: 'settings', label: t('manageSettings') },
    { key: 'permissions', label: t('managePermissions') },
    { key: 'members', label: t('manageMembers') },
    ...(target.privacy === 'request_to_join' ? [{ key: 'requests', label: t('manageRequests') }] : []),
    { key: 'plan', label: t('managePlan') },
    share,
    copy,
    {
      key: 'archive',
      label: isArchived ? t('unarchive') : t('archive'),
      // Archiving takes the community away from everyone in it; restoring it does not.
      destructive: !isArchived,
      confirm: {
        title: isArchived ? t('unarchiveConfirmTitle') : t('archiveConfirmTitle'),
        body: isArchived ? t('unarchiveConfirmBody') : t('archiveConfirmBody'),
        confirmLabel: isArchived ? t('unarchive') : t('archive'),
      },
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
