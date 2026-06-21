'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/upload';

export function ProfileHeader({
  id, fullName, avatarPath, followingCount, followersCount, actions,
}: {
  id: string; fullName: string | null; avatarPath: string | null;
  followingCount: number; followersCount: number; actions?: ReactNode;
}) {
  const { t } = useT('profile');
  const initials = (fullName ?? '?').slice(0, 2).toUpperCase();
  return (
    <div className="flex items-start gap-4 p-6">
      <Avatar className="size-20">
        <AvatarImage src={avatarUrl(avatarPath) ?? undefined} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{fullName ?? '—'}</h1>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <Link href={`/app/profile/${id}/following`}>{followingCount} {t('following')}</Link>
          <Link href={`/app/profile/${id}/followers`}>{followersCount} {t('followers')}</Link>
        </div>
        {actions ? <div className="mt-2 flex gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
