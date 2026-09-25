import Link from 'next/link';
import type { MyGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { GroupThumb } from '@/components/group/GroupThumb';
import { Badge } from '@/components/ui/badge';

/**
 * The compact group card (UX-GRP-03): a small messaging-style thumbnail beside the name and
 * description, with an "Archived" tag for the admins who still see one. Shared by Your Groups and
 * the home page's "Your groups" section.
 */
export function GroupMiniCard({ group }: { group: MyGroup }) {
  const { t } = useT('group');
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
