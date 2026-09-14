'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import {
  useCommunities,
  useCommunityRequests,
  useAcceptJoinRequest,
  useDeclineJoinRequest,
} from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function ManageRequestsPage() {
  const { t } = useT('community');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useCommunities();
  const requests = useCommunityRequests(id);
  const accept = useAcceptJoinRequest(id);
  const decline = useDeclineJoinRequest(id);

  const role = (mine.data ?? []).find((r) => r.community?.id === id)?.role;
  const isAdmin = role === 'admin';
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isAdmin) router.replace(`/app/community/${id}`);
  }, [mine.isLoading, mine.data, isAdmin, id, router]);

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isAdmin) return null;

  if (requests.isLoading) return <Skeleton className="m-6 h-40" />;

  const rows = requests.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('requests')}</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noRequests')}</p>
      ) : (
        <Card className="divide-y p-0">
          {rows.map((r) => {
            const name = r.profiles?.full_name ?? '—';
            const initials = (r.profiles?.full_name ?? '?').slice(0, 2).toUpperCase();
            return (
              <div key={r.id} className="flex items-center gap-3 px-6 py-4">
                <Avatar className="size-10">
                  <AvatarImage src={avatarUrl(r.profiles?.avatar_url) ?? undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                <Button
                  size="sm"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate(r.id)}
                >
                  {t('accept')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decline.isPending}
                  onClick={() => decline.mutate(r.id)}
                >
                  {t('decline')}
                </Button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
