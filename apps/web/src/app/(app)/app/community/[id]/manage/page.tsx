'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import {
  useCommunities,
  useCommunity,
  useCommunityRequests,
  useArchiveCommunity,
} from '@padel/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function ManageHubPage() {
  const { t } = useT('community');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useCommunities();
  const community = useCommunity(id);
  const requests = useCommunityRequests(id);
  const archive = useArchiveCommunity(id);

  const role = (mine.data ?? []).find((r) => r.community?.id === id)?.role;
  const isAdmin = role === 'admin';
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isAdmin) router.replace(`/app/community/${id}`);
  }, [mine.isLoading, mine.data, isAdmin, id, router]);

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isAdmin) return null;

  const archived = !!community.data?.archived_at;

  const links: { key: 'settings' | 'members' | 'permissions' | 'requests' | 'invite'; href: string; label: string }[] = [
    { key: 'settings', href: `/app/community/${id}/manage/settings`, label: t('settings') },
    { key: 'members', href: `/app/community/${id}/manage/members`, label: t('members') },
    { key: 'permissions', href: `/app/community/${id}/manage/permissions`, label: t('permissions') },
    {
      key: 'requests',
      href: `/app/community/${id}/manage/requests`,
      label: `${t('requests')} · ${t('pending', { count: requests.data?.length ?? 0 })}`,
    },
    { key: 'invite', href: `/app/community/${id}/manage/invite`, label: t('invite') },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('manageTitle')}</h1>

      {archived ? (
        <p className="text-sm text-muted-foreground">{t('archivedNotice')}</p>
      ) : null}

      <Card className="divide-y p-0">
        {links.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            className="flex items-center justify-between px-6 py-4 text-sm font-medium hover:bg-muted/50"
          >
            {l.label}
          </Link>
        ))}
      </Card>

      <Button
        variant="secondary"
        disabled={archive.isPending}
        onClick={() => archive.mutate(!archived)}
      >
        {archived ? t('unarchive') : t('archive')}
      </Button>
    </div>
  );
}
