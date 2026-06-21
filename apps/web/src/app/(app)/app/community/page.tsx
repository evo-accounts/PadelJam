'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useCommunities, useSuggestedCommunities, useCanCreateCommunity } from '@padel/api';
import { CommunityCard } from '@/components/community/CommunityCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function CommunityPage() {
  const { t } = useT('community');
  const mine = useCommunities();
  const suggested = useSuggestedCommunities();
  const canCreate = useCanCreateCommunity();

  const mineRows = (mine.data ?? []).filter((row) => row.community != null);
  const mineIds = new Set(mineRows.map((row) => row.community!.id));
  const suggestedRows = (suggested.data ?? []).filter((c) => !mineIds.has(c.id));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        {canCreate.data ? (
          <Button asChild>
            <Link href="/app/community/create">{t('create')}</Link>
          </Button>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('mine')}</h2>
        {mine.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : mineRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyMine')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mineRows.map((row) => (
              <CommunityCard key={row.community!.id} community={row.community!} role={row.role} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('suggested')}</h2>
        {suggested.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {suggestedRows.map((c) => (
              <CommunityCard key={c.id} community={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
