'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useProfile, useBlock } from '@padel/api';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { FollowButton } from '@/components/profile/FollowButton';
import { ReportDialog } from '@/components/profile/ReportDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

// Map raw enum values stored on the profile to translation keys. Values not in the map
// (e.g. a free-form/legacy value) fall through to the raw string.
function label(t: (k: string) => string, value: string | null | undefined): string | null {
  if (!value) return null;
  const keys = ['left', 'right', 'any', 'morning', 'afternoon', 'night'];
  return keys.includes(value) ? t(value) : value;
}

export default function OtherProfilePage() {
  const { t } = useT('profile');
  const { id } = useParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const router = useRouter();
  const block = useBlock();
  const [reportOpen, setReportOpen] = useState(false);

  const isSelf = !!uid && id === uid;
  const q = useProfile(isSelf ? undefined : id);

  // Viewing your own profile here redirects to the canonical own-profile route.
  if (isSelf) {
    router.replace('/app/profile');
    return null;
  }

  if (q.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // null when the target is blocked/hidden or does not exist.
  if (!q.data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-muted-foreground">
        {t('notAvailable')}
      </div>
    );
  }

  const d = q.data;
  const dominantHand = label(t, d.dominant_hand);
  const courtSide = label(t, d.court_side);
  const preferredTime = label(t, d.preferred_time);

  return (
    <div className="p-6">
      <ProfileHeader
        id={id}
        fullName={d.full_name}
        avatarPath={d.avatar_url}
        followingCount={Number(d.following_count)}
        followersCount={Number(d.followers_count)}
        actions={
          <>
            <FollowButton targetId={id} isFollowing={d.is_following} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={t('more')}>
                  …
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => block.mutate(id)}
                  disabled={block.isPending}
                >
                  {t('block')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                  {t('report')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('preferences')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('dominantHand')}</span>
            <span>{dominantHand ?? '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('courtSide')}</span>
            <span>{courtSide ?? '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('preferredTime')}</span>
            <span>{preferredTime ?? '—'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">{t('bio')}</span>
            <span className="whitespace-pre-wrap">{d.description || '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('location')}</span>
            <span>{d.location_text || '—'}</span>
          </div>
        </CardContent>
      </Card>

      <ReportDialog targetId={id} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}
