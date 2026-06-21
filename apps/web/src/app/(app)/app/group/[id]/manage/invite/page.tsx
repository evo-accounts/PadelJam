'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import {
  useMyGroups,
  useGroup,
  useGroupMembers,
  useCommunityMembers,
  useInviteToGroup,
} from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function GroupInvitePage() {
  const { t } = useT('group');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useMyGroups();
  const group = useGroup(id);
  const groupMembers = useGroupMembers(id);
  const communityId = group.data?.community_id ?? '';
  const communityMembers = useCommunityMembers(communityId);
  const invite = useInviteToGroup(id);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const myRow = (mine.data ?? []).find((r) => r.group_id === id);
  const isManaging = !!myRow?.is_managing;
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isManaging) router.replace(`/app/group/${id}`);
  }, [mine.isLoading, mine.data, isManaging, id, router]);

  const candidates = useMemo(() => {
    const memberIds = new Set((groupMembers.data ?? []).map((m) => m.user_id));
    return (communityMembers.data ?? []).filter((m) => !memberIds.has(m.user_id));
  }, [communityMembers.data, groupMembers.data]);

  const onInvite = async (userId: string) => {
    setError(null);
    try {
      await invite.mutateAsync(userId);
      setInvited((prev) => new Set(prev).add(userId));
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(['forbidden', 'not_a_member', 'group_not_found'].includes(code) ? code : 'unknown_error'));
    }
  };

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isManaging) return null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('inviteMembersCta')}</h1>
        <Button asChild variant="ghost">
          <Link href={`/app/group/${id}/manage/members`}>{t('membersRow')}</Link>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {communityMembers.isLoading || groupMembers.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noOneToInvite')}</p>
      ) : (
        <Card className="divide-y p-0">
          {candidates.map((m) => {
            const name = m.profiles?.full_name ?? '—';
            const initials = name.slice(0, 2).toUpperCase();
            const done = invited.has(m.user_id);
            return (
              <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(m.profiles?.avatar_url) ?? undefined} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{name}</span>
                </div>
                <Button size="sm" variant="outline" disabled={done} onClick={() => onInvite(m.user_id)}>
                  {done ? t('invitedLabel') : t('inviteCta')}
                </Button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
