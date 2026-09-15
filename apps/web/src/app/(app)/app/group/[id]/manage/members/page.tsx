'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useMyGroups,
  useGroupMembers,
  useGroupRealtime,
  useRemoveGroupMember,
} from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { avatarUrl } from '@/lib/upload';

const KNOWN = new Set([
  'forbidden',
  'sole_admin_must_add_another',
  'not_a_member',
  'group_not_found',
]);

export default function GroupManageMembersPage() {
  const { t } = useT('group');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const uid = useSession().session?.user.id;
  useGroupRealtime(id);
  const mine = useMyGroups();
  const members = useGroupMembers(id);
  const remove = useRemoveGroupMember(id);
  const [error, setError] = useState<string | null>(null);

  const myRow = (mine.data ?? []).find((r) => r.group_id === id);
  const isManaging = !!myRow?.is_managing;
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isManaging) router.replace(`/app/group/${id}`);
  }, [mine.isLoading, mine.data, isManaging, id, router]);

  const onRemove = async (userId: string) => {
    setError(null);
    try {
      await remove.mutateAsync(userId);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(KNOWN.has(code) ? code : 'unknown_error'));
    }
  };

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isManaging) return null;

  const rows = members.data ?? [];

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('membersRow')}</h1>
        <Button asChild variant="outline">
          <Link href={`/app/group/${id}/manage/invite`}>{t('inviteMembersCta')}</Link>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {members.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <Card className="divide-y p-0">
          {rows.map((m) => {
            const name = m.profiles?.full_name ?? '—';
            const initials = name.slice(0, 2).toUpperCase();
            return (
              <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                <Link
                  href={`/app/profile/${m.user_id}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(m.profiles?.avatar_url) ?? undefined} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{name}</span>
                </Link>
                {m.user_id === uid ? null : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive">
                        {t('removeMemberCta')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('removeMemberConfirm', { name })}</AlertDialogTitle>
                        <AlertDialogDescription />
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onRemove(m.user_id)}>
                          {t('removeMemberCta')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
