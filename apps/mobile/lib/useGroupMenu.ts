/**
 * The group page's header menu — UX-GRP-09 (a member's "⋯") and UX-GRP-10 (an admin's
 * "Manage Group", behind a settings icon). Shaped like `useCommunityMenu`: one hook returning the
 * single `TopBar` action for the viewer, so the header stays declarative.
 *
 * Three flows live here because each asks its question BEFORE acting:
 *   - Leave (UX-GRP-15) checks leave_group_preflight first. The last community admin inside a
 *     private group is offered "Add another admin first" — a way forward, never an error after
 *     confirming (decision 1 keeps that guard private-only).
 *   - Archive (UX-GRP-10/14) is unavailable for the community's last active group, and says why.
 *     That check reads the groups this admin can see; a private group they are not in is
 *     invisible to them, so the server's `last_active_group` stays the final word and is
 *     explained the same way if it answers.
 *   - Reset ranking (UX-GRP-14) opens its confirmation directly and, once the season is closed,
 *     takes the admin to that season's final standings.
 *
 * Plus a row the audit does not list: "Open chat" (decision 4). A group's Stream channel is only
 * created when someone opens it, so dropping the page's chat button without a replacement would
 * quietly end group chat for every new group.
 */
import {
  useArchiveGroup,
  useCommunityGroups,
  useEnsureChannel,
  useLeaveGroup,
  useLeaveGroupPreflight,
  useStartNewSeason,
  useUnarchiveGroup,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';

import { useActionSheet, useBanner, useConfirm } from '@/components/ui';
import { copyGroupLink, shareGroup } from '@/lib/groupShare';
import { markSeasonSeen } from '@/lib/seasonNotice';

export type GroupMenuTarget = {
  id: string;
  name: string;
  communityId: string;
  archivedAt: string | null;
  currentSeasonNumber: number | null;
  /** The viewer belongs to the group (only members can leave or chat). */
  isMember: boolean;
};

export type GroupMenuAction = { icon: string; label: string; onPress: () => void; testID?: string };

export function useGroupMenu(
  target: GroupMenuTarget | null,
  isAdmin: boolean,
  /** Opens the screen's "Add another admin" sheet; leaving resumes from there. */
  onNeedAnotherAdmin: () => void,
): GroupMenuAction | null {
  const { t } = useT('group');
  const router = useRouter();
  const show = useActionSheet();
  const confirm = useConfirm();
  const banner = useBanner();
  const { data: liveGroups } = useCommunityGroups(target?.communityId ?? '');
  const preflight = useLeaveGroupPreflight();
  const leave = useLeaveGroup();
  const archive = useArchiveGroup();
  const unarchive = useUnarchiveGroup();
  const startSeason = useStartNewSeason(target?.id ?? '');
  const ensureChannel = useEnsureChannel();

  if (!target) return null;
  const { id, name, communityId } = target;
  const isArchived = !!target.archivedAt;

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(code, { defaultValue: t('unknown_error') }));
  };

  const explainLastGroup = () =>
    confirm({ title: t('archiveUnavailableTitle'), body: t('last_active_group'), confirmLabel: t('ok') });

  const onShare = async () => {
    try {
      await shareGroup(id, name);
    } catch (e) {
      err(e);
    }
  };

  const onCopy = async () => {
    await copyGroupLink(id);
    banner.show(t('linkCopied'), 'success');
  };

  const onChat = async () => {
    try {
      const { cid } = await ensureChannel.mutateAsync({ kind: 'group', id });
      router.push(('/chat/' + cid) as never);
    } catch {
      banner.show(t('chatUnavailable', { ns: 'chat' }));
    }
  };

  const onLeave = async () => {
    let standing: string;
    try {
      standing = await preflight.mutateAsync(id);
    } catch (e) {
      return err(e);
    }
    if (standing === 'sole_admin') {
      const go = await confirm({
        title: t('leaveAddAdminTitle'),
        body: t('leaveAddAdminBody'),
        confirmLabel: t('addAdminCta'),
        cancelLabel: t('cancel'),
      });
      if (go) onNeedAnotherAdmin();
      return;
    }
    const ok = await confirm({
      title: t('leaveGroupConfirm'),
      body: t('leaveGroupConfirmBody'),
      confirmLabel: t('leaveGroupCta'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await leave.mutateAsync({ groupId: id, communityId });
      banner.show(t('leftToast', { name }), 'success');
      router.back();
    } catch (e) {
      err(e);
    }
  };

  const onArchive = async () => {
    if (isArchived) {
      const ok = await confirm({
        title: t('unarchiveConfirmTitle'),
        body: t('unarchiveConfirmBody'),
        confirmLabel: t('unarchiveCta'),
        cancelLabel: t('cancel'),
      });
      if (!ok) return;
      try {
        await unarchive.mutateAsync({ groupId: id, communityId });
        banner.show(t('unarchivedToast'), 'success');
      } catch (e) {
        err(e);
      }
      return;
    }
    const othersActive = (liveGroups ?? []).some((g) => g.id !== id);
    if (!othersActive) return void explainLastGroup();
    const ok = await confirm({
      title: t('archiveConfirmTitle'),
      body: t('archiveConfirm'),
      confirmLabel: t('archiveCta'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await archive.mutateAsync({ groupId: id, communityId });
      banner.show(t('archivedToast'), 'success');
    } catch (e) {
      if (e instanceof Error && e.message === 'last_active_group') return void explainLastGroup();
      err(e);
    }
  };

  const onResetRanking = async () => {
    const current = target.currentSeasonNumber ?? 1;
    const ok = await confirm({
      title: t('resetRankingConfirmTitle'),
      body: t('resetRankingConfirmBody', { current, next: current + 1 }),
      confirmLabel: t('resetRankingCta'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      // start_new_season answers with the NEW season's number; the one just closed is before it.
      const next = (await startSeason.mutateAsync()) as number;
      const closed = next - 1;
      // The admin who closed it sees the completion screen, not the notice other members get.
      await markSeasonSeen(id, closed);
      router.push(`/group/${id}/season/${closed}?ended=1` as never);
    } catch (e) {
      err(e);
    }
  };

  const go = (path: string) => router.push(path as never);

  const share = { key: 'share', label: t('shareCta') };
  const copy = { key: 'copy', label: t('copyLinkCta') };
  const chat = { key: 'chat', label: t('openChat', { ns: 'chat' }) };
  const leaveRow = { key: 'leave', label: t('leaveGroupCta'), destructive: true, selfConfirm: true };

  const memberRows = [share, copy, ...(target.isMember ? [chat, leaveRow] : [])];
  const adminRows = [
    { key: 'settings', label: t('settingsRow') },
    { key: 'members', label: t('manageMembersRow') },
    ...(isArchived ? [] : [{ key: 'reset', label: t('resetRankingRow'), selfConfirm: true }]),
    ...(target.isMember ? [chat] : []),
    share,
    copy,
    ...(target.isMember ? [leaveRow] : []),
    {
      key: 'archive',
      label: isArchived ? t('unarchiveCta') : t('archiveCta'),
      destructive: !isArchived,
      selfConfirm: true,
    },
  ];

  const run = async (actions: typeof adminRows, title: string) => {
    const key = await show({ title, actions });
    switch (key) {
      case 'settings':
        return go(`/group/${id}/manage/settings`);
      case 'members':
        return go(`/group/${id}/manage/members`);
      case 'reset':
        return void onResetRanking();
      case 'chat':
        return void onChat();
      case 'share':
        return void onShare();
      case 'copy':
        return void onCopy();
      case 'leave':
        return void onLeave();
      case 'archive':
        return void onArchive();
      default:
        return undefined;
    }
  };

  return isAdmin
    ? { icon: '⚙', label: t('manageTitle'), onPress: () => void run(adminRows, t('manageTitle')), testID: 'group-manage' }
    : { icon: '⋯', label: t('more'), onPress: () => void run(memberRows, name), testID: 'group-more' };
}
