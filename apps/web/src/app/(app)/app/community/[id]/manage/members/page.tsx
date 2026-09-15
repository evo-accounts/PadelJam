'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useCommunities,
  useCommunityMembers,
  useMembersRealtime,
  useMakeAdmin,
  useRemoveAdmin,
  useRemoveMember,
} from '@padel/api';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function ManageMembersPage() {
  const { t } = useT('community');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useCommunities();

  useMembersRealtime(id);
  const members = useCommunityMembers(id);
  const makeAdmin = useMakeAdmin(id);
  const removeAdmin = useRemoveAdmin(id);
  const removeMember = useRemoveMember(id);
  const myUid = useSession().session?.user.id;
  const [err, setErr] = useState<string | null>(null);

  const role = (mine.data ?? []).find((r) => r.community?.id === id)?.role;
  const isAdmin = role === 'admin';
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isAdmin) router.replace(`/app/community/${id}`);
  }, [mine.isLoading, mine.data, isAdmin, id, router]);

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isAdmin) return null;

  const onError = (e: { message?: string }) => setErr(String(e.message ?? ''));
  const rows = members.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('members')}</h1>

      {err ? <p className="text-sm text-destructive">{err}</p> : null}

      <Card className="divide-y p-0">
        {rows.map((m) => {
          const name = m.profiles?.full_name ?? '—';
          const initials = (m.profiles?.full_name ?? '?').slice(0, 2).toUpperCase();
          return (
            <div key={m.user_id} className="flex items-center gap-3 px-6 py-4">
              <Avatar className="size-10">
                <AvatarImage src={avatarUrl(m.profiles?.avatar_url) ?? undefined} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
              <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                {t(`role_${m.role}`)}
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t('manage')}>
                    ⋮
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {m.role === 'member' ? (
                    <DropdownMenuItem
                      onSelect={() => makeAdmin.mutate(m.user_id, { onError })}
                    >
                      {t('makeAdmin')}
                    </DropdownMenuItem>
                  ) : null}

                  {m.role === 'admin' ? (
                    <DropdownMenuItem
                      onSelect={() => removeAdmin.mutate(m.user_id, { onError })}
                    >
                      {t('removeAdmin')}
                    </DropdownMenuItem>
                  ) : null}

                  {m.user_id !== myUid ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          {t('removeMember')}
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('confirmRemoveTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('confirmRemoveBody')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeMember.mutate(m.user_id, { onError })}
                          >
                            {t('confirm')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}

                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
