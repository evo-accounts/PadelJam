'use client';
import type { ReactNode } from 'react';
import { useT } from '@padel/i18n';
import type { Tables } from '@padel/db';
import { Badge } from '@/components/ui/badge';
import { communityImageUrl } from '@/lib/community-images';

type Community = Tables<'communities'>;

const privacyKey: Record<string, 'privacyPublic' | 'privacyRequest' | 'privacyPrivate'> = {
  public: 'privacyPublic',
  request_to_join: 'privacyRequest',
  private: 'privacyPrivate',
};

const typeKey: Record<string, 'typeClub' | 'typeTeam' | 'typeFriends'> = {
  club: 'typeClub',
  team: 'typeTeam',
  friends: 'typeFriends',
};

export function CommunityHeader({
  community,
  memberCount,
  cta,
}: {
  community: Community;
  memberCount: number;
  cta?: ReactNode;
}) {
  const { t } = useT('community');
  const cover = communityImageUrl(community.cover_image_path, 'community-covers');
  const thumb = communityImageUrl(community.thumbnail_path, 'community-thumbnails');
  const initials = (community.name ?? '?').slice(0, 2).toUpperCase();
  const isArchived = community.archived_at != null;

  return (
    <div className="flex flex-col">
      <div className="relative h-40 w-full bg-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : null}
        <div className="absolute -bottom-8 left-4">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className="size-20 rounded-xl border-4 border-background object-cover"
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-xl border-4 border-background bg-muted text-lg font-medium text-muted-foreground">
              {initials}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{community.name}</h1>
              {isArchived ? <Badge variant="secondary">{t('archived')}</Badge> : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">{t(typeKey[community.type] ?? 'typeClub')}</Badge>
              <Badge variant="outline">{t('memberCount', { count: memberCount })}</Badge>
              <Badge variant="secondary">{t(privacyKey[community.privacy] ?? 'privacyPublic')}</Badge>
            </div>
          </div>
          {cta ? <div className="shrink-0">{cta}</div> : null}
        </div>

        {community.description ? (
          <p className="text-sm text-muted-foreground">{community.description}</p>
        ) : null}
      </div>
    </div>
  );
}
