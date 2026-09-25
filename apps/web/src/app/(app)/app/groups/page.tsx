'use client';
/**
 * Your Groups (UX-GRP-03): every group the user belongs to, sectioned by community — no tabs.
 * Web's twin of mobile's `app/groups/index.tsx`.
 *
 *   header    "Your Groups" and "Create group" — only for someone who may create a group
 *             somewhere (UX-GRP-01, decision 6: permission, not plan headroom).
 *   sections  one per community: its name with "Show all" (the community page), then that
 *             community's groups as compact cards — small thumbnail, name, description.
 *   archived  an admin keeps their archived groups here with an "Archived" tag (the group page
 *             opens read-only with "Unarchive group"); a member never sees them.
 *   empty     the standard empty state, its action leading to the communities, where groups live.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { useCreatableCommunities, useMyGroups, type MyGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { GroupEmpty } from '@/components/group/GroupEmpty';
import { GroupThumb } from '@/components/group/GroupThumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type Section = { communityId: string; communityName: string; groups: MyGroup[] };

export default function YourGroupsPage() {
  const { t } = useT('group');
  const { t: tcommon } = useT('common');
  const groups = useMyGroups({ includeArchived: true });
  const { communities: creatable } = useCreatableCommunities();
  const canCreate = creatable.length > 0;

  const sections = useMemo<Section[]>(() => {
    const by = new Map<string, Section>();
    for (const g of groups.data ?? []) {
      const s = by.get(g.community_id) ?? { communityId: g.community_id, communityName: g.community_name, groups: [] };
      s.groups.push(g);
      by.set(g.community_id, s);
    }
    // Active groups first within a community; archived ones trail.
    for (const s of by.values()) s.groups.sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at));
    return [...by.values()];
  }, [groups.data]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('yourGroupsTitle')}</h1>
        {canCreate ? (
          <Button asChild data-testid="your-groups-create">
            <Link href="/app/groups/create">{t('createCta')}</Link>
          </Button>
        ) : null}
      </div>

      {groups.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : groups.isError ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center" data-testid="empty-groups">
          <p className="text-sm text-destructive">{t('loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => void groups.refetch()}>
            {tcommon('retry')}
          </Button>
        </div>
      ) : sections.length === 0 ? (
        <GroupEmpty
          title={t('yourGroupsEmptyTitle')}
          body={t('yourGroupsEmptyBody')}
          action={{ label: t('exploreGroupsCta'), href: '/app/community' }}
          testId="empty-groups"
        />
      ) : (
        sections.map((s) => (
          <section key={s.communityId} className="flex flex-col gap-3" aria-labelledby={`groups-${s.communityId}`}>
            <div className="flex items-center justify-between gap-3">
              <h2 id={`groups-${s.communityId}`} className="truncate text-base font-semibold">
                {s.communityName}
              </h2>
              <Link
                href={`/app/community/${s.communityId}`}
                className="shrink-0 text-sm font-medium text-primary hover:underline"
                aria-label={t('showAllIn', { name: s.communityName })}
              >
                {t('showAll')}
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.groups.map((g) => (
                <Link
                  key={g.group_id}
                  href={`/app/group/${g.group_id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  data-testid={`group-card-${g.group_id}`}
                >
                  <GroupThumb path={g.thumbnail_path} name={g.name} className="size-11" />
                  <span className="flex min-w-0 flex-1 flex-col items-start">
                    <span className="w-full truncate text-sm font-medium">{g.name}</span>
                    {g.description ? (
                      <span className="line-clamp-2 text-xs text-muted-foreground">{g.description}</span>
                    ) : null}
                    {g.archived_at ? (
                      <Badge variant="outline" className="mt-1">
                        {t('archivedTag')}
                      </Badge>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
