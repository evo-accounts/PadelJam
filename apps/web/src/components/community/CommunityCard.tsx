'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import type { Tables } from '@padel/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { communityImageUrl } from '@/lib/community-images';

type Community = Tables<'communities'>;

const privacyKey: Record<string, 'privacyPublic' | 'privacyRequest' | 'privacyPrivate'> = {
  public: 'privacyPublic',
  request_to_join: 'privacyRequest',
  private: 'privacyPrivate',
};

export function CommunityCard({ community, role }: { community: Community; role?: string }) {
  const { t } = useT('community');
  const thumb = communityImageUrl(community.thumbnail_path, 'community-thumbnails');
  const initials = (community.name ?? '?').slice(0, 2).toUpperCase();
  const privacyLabel = t(privacyKey[community.privacy] ?? 'privacyPublic');

  return (
    <Link href={`/app/community/${community.id}`} className="block">
      <Card className="overflow-hidden py-0 transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3 p-3">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className="size-14 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">
              {initials}
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium">{community.name}</span>
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary">{privacyLabel}</Badge>
              {role ? <Badge variant="outline">{t(`role_${role}`)}</Badge> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
