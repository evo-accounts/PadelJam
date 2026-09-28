'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useCommunities, useFollowing, useInviteMembers } from '@padel/api';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function InvitePage() {
  const { t } = useT('community');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useCommunities();

  const myUid = useSession().session?.user.id;
  const following = useFollowing(myUid);
  const invite = useInviteMembers(id);
  const [invited, setInvited] = useState<Set<string>>(new Set());

  const role = (mine.data ?? []).find((r) => r.community?.id === id)?.role;
  const isAdmin = role === 'admin';
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isAdmin) router.replace(`/app/community/${id}`);
  }, [mine.isLoading, mine.data, isAdmin, id, router]);

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isAdmin) return null;

  const people = following.data?.pages.flat() ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('inviteFollowing')}</h1>

      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noFollowing')}</p>
      ) : (
        <Card className="divide-y p-0">
          {people.map((person) => {
            const name = person.full_name ?? '—';
            const initials = (person.full_name ?? '?').slice(0, 2).toUpperCase();
            const isInvited = invited.has(person.id);
            return (
              <div key={person.id} className="flex items-center gap-3 px-6 py-4">
                <Avatar className="size-10">
                  <AvatarImage src={avatarUrl(person.avatar_url) ?? undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                <Button
                  variant="secondary"
                  disabled={isInvited}
                  onClick={() =>
                    invite.mutate(
                      { inviteeIds: [person.id], groupIds: [] },
                      { onSuccess: () => setInvited((s) => new Set(s).add(person.id)) },
                    )
                  }
                >
                  {isInvited ? t('invited') : t('inviteCta')}
                </Button>
              </div>
            );
          })}
        </Card>
      )}

      {following.hasNextPage ? (
        <Button
          variant="secondary"
          onClick={() => following.fetchNextPage()}
          disabled={following.isFetchingNextPage}
        >
          {t('profile:loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
