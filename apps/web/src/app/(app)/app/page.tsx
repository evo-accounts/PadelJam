'use client';
import Link from 'next/link';
import { useMyGroups, useMyProfile, useCommunities } from '@padel/api';
import { useT } from '@padel/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { GroupMiniCard } from '@/components/group/GroupMiniCard';

// Home shows a handful of groups; the rest are one click away on Your Groups, which has no
// sidebar entry of its own — this section is the way in (product decision, 2026-09-25).
const HOME_GROUPS = 6;

export default function AppHome() {
  const { t } = useT('app');
  const { t: tg } = useT('group');
  const profile = useMyProfile();
  const communities = useCommunities();
  const groups = useMyGroups();

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">
        {profile.isLoading ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          t('welcome', { name: profile.data?.full_name ?? '' })
        )}
      </h1>
      <section className="flex flex-col gap-2" aria-labelledby="home-groups" data-testid="home-groups">
        <div className="flex items-center justify-between gap-3">
          <h2 id="home-groups" className="text-sm font-medium text-muted-foreground">
            {tg('yourGroupsTitle')}
          </h2>
          {(groups.data ?? []).length > 0 ? (
            <Link href="/app/groups" className="text-sm font-medium text-primary hover:underline" data-testid="home-groups-see-all">
              {tg('seeAll')}
            </Link>
          ) : null}
        </div>
        {groups.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (groups.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{tg('yourGroupsEmptyTitle')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(groups.data ?? []).slice(0, HOME_GROUPS).map((g) => (
              <GroupMiniCard key={g.group_id} group={g} />
            ))}
          </div>
        )}
      </section>
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
