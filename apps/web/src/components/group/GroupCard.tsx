'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { communityImageUrl } from '@/lib/community-images';

interface GroupCardProps {
  group: {
    id: string;
    name: string;
    communityName?: string;
    memberCount?: number;
    thumbnailPath?: string | null;
    archived?: boolean;
  };
}

export function GroupCard({ group }: GroupCardProps) {
  const { t } = useT('group');
  const thumb = communityImageUrl(group.thumbnailPath, 'community-thumbnails');
  const initials = (group.name ?? '?').slice(0, 2).toUpperCase();

  return (
    <Link href={`/app/group/${group.id}`} className="block">
      <Card className="overflow-hidden py-0 transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3 p-3">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">
              {initials}
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium">{group.name}</span>
            {group.communityName ? (
              <span className="truncate text-sm text-muted-foreground">{group.communityName}</span>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {group.memberCount !== undefined ? (
                <Badge variant="secondary">{t('memberCount', { count: group.memberCount })}</Badge>
              ) : null}
              {group.archived ? <Badge variant="outline">{t('archived')}</Badge> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
