'use client';
import { useMyProfile, useCommunities } from '@padel/api';
import { useT } from '@padel/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function AppHome() {
  const { t } = useT('app');
  const profile = useMyProfile();
  const communities = useCommunities();

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">
        {profile.isLoading ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          t('welcome', { name: profile.data?.full_name ?? '' })
        )}
      </h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('nav.community')}</h2>
        {communities.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (communities.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noCommunities')}</p>
        ) : (
          <div className="grid gap-2">
            {(communities.data ?? []).map(({ community }) =>
              community ? (
                <Card key={community.id} className="p-4">
                  {community.name}
                </Card>
              ) : null,
            )}
          </div>
        )}
      </section>
    </div>
  );
}
