'use client';
/**
 * The one members page (UX-GRP-07), reached from the group page's members line and — for admins —
 * from Manage group's "Manage members" (UX-GRP-12). Both routes render this component, so the two
 * can no longer drift apart. Web's twin of mobile's GroupMembersList.
 *
 *   - Search at the top; "Invite member" below it, only for whoever may invite.
 *   - Rows: photo, name. Someone who has left stays listed in greyscale with a "No longer in
 *     group" tag (decision 2) — their history is still the group's history.
 *   - An admin gets a row menu (UX-GRP-13): See profile, Remove from group (confirmed; this group
 *     only, the person stays in the community). No "Make admin": admin rights are community-level
 *     (UX-COMM-20). Everyone else's row is simply a link to the profile.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { avatarUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { GroupConfirm } from './GroupConfirm';
import { GroupEmpty } from './GroupEmpty';
import { GroupPageTitle } from './GroupHeader';

export function GroupMembersList({ groupId }: { groupId: string }) {
  const { t } = useT('group');
  const { t: tcommon } = useT('common');
  const uid = useSession().session?.user.id;

  const { data: group } = useGroup(groupId);
  const people = useGroupMemberList(groupId);
  const { data: communityMembers } = useCommunityMembers(group?.community_id);
  const { data: canInvite } = useCanInviteToGroup(groupId);
  const remove = useRemoveGroupMember(groupId);
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<GroupMemberListRow | null>(null);

  const isMember = (people.data ?? []).some((p) => p.user_id === uid && p.is_member);
  const isCommunityAdmin = (communityMembers ?? []).some((m) => m.user_id === uid && m.role === 'admin');
  const isAdmin = isCommunityAdmin && (!group?.is_private || isMember);
  const isArchived = !!group?.archived_at;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = people.data ?? [];
    return q.length === 0 ? list : list.filter((p) => (p.full_name ?? '').toLowerCase().includes(q));
  }, [people.data, query]);

  // Admins act on current members other than themselves; everything else is a profile link.
  const manageable = (p: GroupMemberListRow) => isAdmin && !isArchived && p.is_member && p.user_id !== uid;

  const onRemove = async () => {
    if (!removing) return;
    const name = removing.full_name ?? '—';
    try {
      await remove.mutateAsync(removing.user_id);
      setRemoving(null);
      toast(t('removedToast', { name }));
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      toast(t(code, { defaultValue: t('unknown_error') }), 'error');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <GroupPageTitle title={t('membersTitle')} fallbackHref={`/app/group/${groupId}`} subtitle={group?.name} />
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('membersSearchPlaceholder')}
        aria-label={t('membersSearchPlaceholder')}
      />
      {canInvite && !isArchived ? (
        <Button asChild variant="outline" className="w-full" data-testid="group-members-invite">
          <Link href={`/app/group/${groupId}/invite`}>{t('inviteMemberRow')}</Link>
        </Button>
      ) : null}

      {people.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : people.isError ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center" data-testid="error-group-members">
          <p className="text-sm text-destructive">{t('loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => void people.refetch()}>
            {tcommon('retry')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <GroupEmpty title={query ? t('membersNoMatch') : t('groupMembersEmptyTitle')} testId="empty-group-members" />
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rows.map((p) => {
            const name = p.full_name ?? '—';
            const identity = (
              <>
                <Avatar className={cn('size-10', !p.is_member && 'grayscale')}>
                  <AvatarImage src={avatarUrl(p.avatar_url) ?? undefined} alt="" />
                  <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col items-start">
                  <span className={cn('truncate text-sm font-medium', !p.is_member && 'text-muted-foreground')}>
                    {name}
                  </span>
                  {p.is_member ? null : (
                    <Badge variant="outline" className="mt-0.5">
                      {t('departedTag')}
                    </Badge>
                  )}
                </span>
              </>
            );
            return (
              <li key={p.user_id} className="flex items-center gap-2 px-4 py-2" data-testid={`group-member-${p.user_id}`}>
                <Link
                  href={`/app/profile/${p.user_id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md hover:opacity-80"
                  aria-label={p.is_member ? name : `${name}, ${t('departedTag')}`}
                >
                  {identity}
                </Link>
                {manageable(p) ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t('memberActionsA11y', { name })}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/app/profile/${p.user_id}`}>{t('seeProfile')}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(p)}>
                        {t('removeMemberCta')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <GroupConfirm
        open={removing != null}
        onClose={() => setRemoving(null)}
        title={t('removeMemberConfirm', { name: removing?.full_name ?? '—' })}
        body={t('removeMemberConfirmBody')}
        confirmLabel={t('removeMemberCta')}
        cancelLabel={t('cancel')}
        destructive
        busy={remove.isPending}
        onConfirm={onRemove}
      />
    </div>
  );
}
