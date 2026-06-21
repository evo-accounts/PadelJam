'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useMyGroups, useGroup, useArchiveGroup, useUnarchiveGroup } from '@padel/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function GroupManageHubPage() {
  const { t } = useT('group');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useMyGroups();
  const group = useGroup(id);
  const archive = useArchiveGroup();
  const unarchive = useUnarchiveGroup();

  const myRow = (mine.data ?? []).find((r) => r.group_id === id);
  const isManaging = !!myRow?.is_managing;
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isManaging) router.replace(`/app/group/${id}`);
  }, [mine.isLoading, mine.data, isManaging, id, router]);

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isManaging) return null;

  const archived = !!group.data?.archived_at;
  const communityId = group.data?.community_id ?? '';
  const busy = archive.isPending || unarchive.isPending;

  const links = [
    { key: 'settings', href: `/app/group/${id}/manage/settings`, label: t('settingsRow') },
    { key: 'members', href: `/app/group/${id}/manage/members`, label: t('membersRow') },
    { key: 'seasons', href: `/app/group/${id}/manage/seasons`, label: t('seasonsRow') },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('manageTitle')}</h1>
      {archived ? <p className="text-sm text-muted-foreground">{t('archivedNotice')}</p> : null}
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
        variant="outline"
        disabled={busy || !communityId}
        onClick={() =>
          archived
            ? unarchive.mutate({ groupId: id, communityId })
            : archive.mutate({ groupId: id, communityId })
        }
      >
        {archived ? t('unarchive') : t('archive')}
      </Button>
    </div>
  );
}
