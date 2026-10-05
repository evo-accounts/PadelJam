import Link from 'next/link';
import type { MyGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { GroupThumb } from '@/components/group/GroupThumb';
import { Badge } from '@/components/ui/badge';

/**
 * The compact group card (UX-GRP-03): a small messaging-style thumbnail beside the name and
 * description, with an "Archived" tag for the admins who still see one. Used by Your Groups.
 *
 * `orientation="vertical"` (UX-GLOB-09) is the fixed-width card for a horizontally scrolling rail
 * — Home's My Groups (UX-HOME-01): thumbnail on top, then the name, the player count and the
 * community, like mobile's vertical GroupCard.
 */
export function GroupMiniCard({
  group,
  orientation = 'horizontal',
}: {
  group: MyGroup;
  orientation?: 'horizontal' | 'vertical';
}) {
  const { t } = useT('group');

  if (orientation === 'vertical') {
    return (
      <Link
        href={`/app/group/${group.group_id}`}
        className="flex w-44 shrink-0 snap-start flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-testid={`group-card-${group.group_id}`}
      >
        <GroupThumb path={group.thumbnail_path} name={group.name} className="size-16 rounded-xl text-lg" />
        <span className="line-clamp-2 w-full text-sm font-medium">{group.name}</span>
        <span className="text-xs text-muted-foreground">{t('playersCount', { count: group.member_count })}</span>
        <span className="w-full truncate text-xs text-muted-foreground">{group.community_name}</span>
        {group.archived_at ? <Badge variant="outline">{t('archivedTag')}</Badge> : null}
      </Link>
    );
  }

  return (
    <Link
      href={`/app/group/${group.group_id}`}
      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
      data-testid={`group-card-${group.group_id}`}
    >
      <GroupThumb path={group.thumbnail_path} name={group.name} className="size-11" />
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className="w-full truncate text-sm font-medium">{group.name}</span>
        {group.description ? (
          <span className="line-clamp-2 text-xs text-muted-foreground">{group.description}</span>
        ) : null}
        {group.archived_at ? (
          <Badge variant="outline" className="mt-1">
            {t('archivedTag')}
          </Badge>
        ) : null}
      </span>
    </Link>
  );
}
