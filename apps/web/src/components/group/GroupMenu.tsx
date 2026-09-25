'use client';
/**
 * The group page's header menu — UX-GRP-09 (a member's "⋯") and UX-GRP-10 (an admin's "Manage
 * group", behind a settings icon). Web's twin of mobile's `useGroupMenu`, as a dropdown plus the
 * dialogs its rows open. It replaces the old `/manage` hub page and `/manage/seasons`.
 *
 * Every destructive row asks BEFORE acting:
 *   - Leave (UX-GRP-15) checks leave_group_preflight first. The last community admin inside a
 *     private group is told to add another admin and offered the picker to do it — a way forward,
 *     never an error after confirming (decision 1). Everyone else gets a confirmation saying their
 *     match records are kept. This is also web bug B10: leaving used to happen on the first click
 *     and every failure read "This group is not available".
 *   - Archive (UX-GRP-10/14) says upcoming events are cancelled; for the community's last active
 *     group it explains why it cannot, both before asking and if the server answers
 *     `last_active_group` (a private group this admin is not in is invisible to the pre-check).
 *   - Reset ranking (UX-GRP-14) closes the season and opens its final standings as the
 *     completion view (`?ended=1`).
 *
 * Plus "Open chat" (decision 4): a group's channel is created on demand, so the page's chat button
 * leaving without a replacement would quietly end group chat for new groups.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Settings } from 'lucide-react';
import {
  useAddGroupAdmins,
  useArchiveGroup,
  useCommunityGroups,
  useEnsureChannel,
  useLeaveGroup,
  useLeaveGroupPreflight,
  useStartNewSeason,
  useUnarchiveGroup,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toaster';
import { GroupConfirm as Confirm } from './GroupConfirm';
import { copyGroupLink, shareGroup, useCanNativeShare } from '@/lib/groupShare';
import { markSeasonSeen } from '@/lib/seasonNotice';
import { avatarUrl } from '@/lib/upload';

export type GroupMenuTarget = {
  id: string;
  name: string;
  communityId: string;
  archivedAt: string | null;
  currentSeasonNumber: number | null;
  /** The viewer belongs to the group (only members can leave or chat). */
  isMember: boolean;
};

export type EligibleAdmin = { userId: string; name: string | null; avatarPath: string | null };

type Dialogs = 'leave' | 'soleAdmin' | 'addAdmin' | 'archive' | 'unarchive' | 'lastGroup' | 'reset' | null;

export function GroupMenu({
  target,
  isAdmin,
  eligibleAdmins,
}: {
  target: GroupMenuTarget;
  isAdmin: boolean;
  /** Community admins not in the group — who "Add another admin" can pick from. */
  eligibleAdmins: EligibleAdmin[];
}) {
  const { t } = useT('group');
  const { t: tchat } = useT('chat');
  const router = useRouter();
  const canNativeShare = useCanNativeShare();
  const { id, name, communityId } = target;
  const isArchived = !!target.archivedAt;

  const { data: liveGroups } = useCommunityGroups(communityId);
  const preflight = useLeaveGroupPreflight();
  const leave = useLeaveGroup();
  const archive = useArchiveGroup();
  const unarchive = useUnarchiveGroup();
  const startSeason = useStartNewSeason(id);
  const ensureChannel = useEnsureChannel();
  const addAdmins = useAddGroupAdmins(id);

  const [dialog, setDialog] = useState<Dialogs>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    toast(t(code, { defaultValue: t('unknown_error') }), 'error');
  };
  const close = () => setDialog(null);
  const goBack = () => (window.history.length > 1 ? router.back() : router.push('/app/groups'));

  const onShare = async () => {
    try {
      const how = await shareGroup(id, name);
      if (how === 'copied') toast(t('linkCopied'));
    } catch {
      toast(t('copyFailed'), 'error');
    }
  };
  const onCopy = async () => {
    try {
      await copyGroupLink(id);
      toast(t('linkCopied'));
    } catch {
      // The browser refused the clipboard (no permission, page not focused).
      toast(t('copyFailed'), 'error');
    }
  };
  const onChat = async () => {
    try {
      const { cid } = await ensureChannel.mutateAsync({ kind: 'group', id });
      router.push(`/app/chat/${encodeURIComponent(cid)}`);
    } catch {
      toast(tchat('chatUnavailable'), 'error');
    }
  };

  const onLeave = async () => {
    try {
      const standing = await preflight.mutateAsync(id);
      setDialog(standing === 'sole_admin' ? 'soleAdmin' : 'leave');
    } catch (e) {
      fail(e);
    }
  };
  const doLeave = async () => {
    setBusy(true);
    try {
      await leave.mutateAsync({ groupId: id, communityId });
      close();
      toast(t('leftToast', { name }));
      goBack();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const addAdminsThenLeave = async () => {
    setBusy(true);
    try {
      await addAdmins.mutateAsync(picked);
      await leave.mutateAsync({ groupId: id, communityId });
      close();
      toast(t('leftToast', { name }));
      goBack();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const onArchive = () => {
    if (isArchived) return setDialog('unarchive');
    const othersActive = (liveGroups ?? []).some((g) => g.id !== id);
    setDialog(othersActive ? 'archive' : 'lastGroup');
  };
  const doArchive = async () => {
    setBusy(true);
    try {
      await archive.mutateAsync({ groupId: id, communityId });
      close();
      toast(t('archivedToast'));
    } catch (e) {
      if (e instanceof Error && e.message === 'last_active_group') setDialog('lastGroup');
      else fail(e);
    } finally {
      setBusy(false);
    }
  };
  const doUnarchive = async () => {
    setBusy(true);
    try {
      await unarchive.mutateAsync({ groupId: id, communityId });
      close();
      toast(t('unarchivedToast'));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      // start_new_season answers with the NEW season's number; the one just closed is before it.
      const next = (await startSeason.mutateAsync()) as number;
      const closed = next - 1;
      // The admin who closed it sees the completion view, not the notice other members get.
      markSeasonSeen(id, closed);
      close();
      router.push(`/app/group/${id}/season/${closed}?ended=1`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const current = target.currentSeasonNumber ?? 1;
  const shareItem = canNativeShare ? (
    <DropdownMenuItem onSelect={() => void onShare()}>{t('shareCta')}</DropdownMenuItem>
  ) : null;
  const copyItem = <DropdownMenuItem onSelect={() => void onCopy()}>{t('copyLinkCta')}</DropdownMenuItem>;
  const chatItem = target.isMember ? (
    <DropdownMenuItem onSelect={() => void onChat()}>{tchat('openChat')}</DropdownMenuItem>
  ) : null;
  const leaveItem = target.isMember ? (
    <DropdownMenuItem variant="destructive" onSelect={() => void onLeave()} data-testid="group-menu-leave">
      {t('leaveGroupCta')}
    </DropdownMenuItem>
  ) : null;

  return (
    <>
      {/* Non-modal so the dialogs a row opens are not fighting the menu for focus and pointer. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={isAdmin ? t('manageTitle') : t('more')}
            data-testid={isAdmin ? 'group-manage' : 'group-more'}
          >
            {isAdmin ? <Settings /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {isAdmin ? (
            <>
              <DropdownMenuItem onSelect={() => router.push(`/app/group/${id}/manage/settings`)}>
                {t('settingsRow')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push(`/app/group/${id}/manage/members`)}>
                {t('manageMembersRow')}
              </DropdownMenuItem>
              {isArchived ? null : (
                <DropdownMenuItem onSelect={() => setDialog('reset')} data-testid="group-menu-reset">
                  {t('resetRankingRow')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {chatItem}
              {shareItem}
              {copyItem}
              {leaveItem}
              <DropdownMenuItem
                variant={isArchived ? 'default' : 'destructive'}
                onSelect={onArchive}
                data-testid="group-menu-archive"
              >
                {isArchived ? t('unarchiveCta') : t('archiveCta')}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              {shareItem}
              {copyItem}
              {chatItem}
              {leaveItem}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Confirm
        open={dialog === 'leave'}
        onClose={close}
        title={t('leaveGroupConfirm')}
        body={t('leaveGroupConfirmBody')}
        confirmLabel={t('leaveGroupCta')}
        cancelLabel={t('cancel')}
        destructive
        busy={busy}
        onConfirm={doLeave}
      />
      <Confirm
        open={dialog === 'soleAdmin'}
        onClose={close}
        title={t('leaveAddAdminTitle')}
        body={t('leaveAddAdminBody')}
        confirmLabel={t('addAdminCta')}
        cancelLabel={t('cancel')}
        onConfirm={() => {
          setPicked([]);
          setDialog('addAdmin');
        }}
      />
      <Confirm
        open={dialog === 'archive'}
        onClose={close}
        title={t('archiveConfirmTitle')}
        body={t('archiveConfirm')}
        confirmLabel={t('archiveCta')}
        cancelLabel={t('cancel')}
        destructive
        busy={busy}
        onConfirm={doArchive}
      />
      <Confirm
        open={dialog === 'unarchive'}
        onClose={close}
        title={t('unarchiveConfirmTitle')}
        body={t('unarchiveConfirmBody')}
        confirmLabel={t('unarchiveCta')}
        cancelLabel={t('cancel')}
        busy={busy}
        onConfirm={doUnarchive}
      />
      <Confirm
        open={dialog === 'lastGroup'}
        onClose={close}
        title={t('archiveUnavailableTitle')}
        body={t('last_active_group')}
        confirmLabel={t('ok')}
        onConfirm={close}
      />
      <Confirm
        open={dialog === 'reset'}
        onClose={close}
        title={t('resetRankingConfirmTitle')}
        body={t('resetRankingConfirmBody', { current, next: current + 1 })}
        confirmLabel={t('resetRankingCta')}
        cancelLabel={t('cancel')}
        destructive
        busy={busy}
        onConfirm={doReset}
      />

      <Dialog open={dialog === 'addAdmin'} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent data-testid="add-admin-dialog">
          <DialogHeader>
            <DialogTitle>{t('addAdminTitle')}</DialogTitle>
            <DialogDescription>{t('addAdminBody')}</DialogDescription>
          </DialogHeader>
          {eligibleAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noEligibleAdmins')}</p>
          ) : (
            <ul className="flex max-h-72 flex-col overflow-y-auto">
              {eligibleAdmins.map((m) => {
                const label = m.name ?? '—';
                const checked = picked.includes(m.userId);
                return (
                  <li key={m.userId}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={checked}
                        onChange={() =>
                          setPicked((s) => (s.includes(m.userId) ? s.filter((x) => x !== m.userId) : [...s, m.userId]))
                        }
                      />
                      <Avatar className="size-8">
                        <AvatarImage src={avatarUrl(m.avatarPath) ?? undefined} alt="" />
                        <AvatarFallback className="text-xs">{label.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm font-medium">{label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t('cancel')}
            </Button>
            <Button disabled={picked.length === 0 || busy} onClick={() => void addAdminsThenLeave()}>
              {t('addAdminCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
