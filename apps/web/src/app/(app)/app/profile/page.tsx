'use client';
import Link from 'next/link';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useProfile, useMyProfile } from '@padel/api';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { BadgeCard } from '@/components/profile/ProfileBadges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Map raw enum values stored on the profile to translation keys. Values not in the map
// (e.g. a free-form/legacy value) fall through to the raw string.
function label(t: (k: string) => string, value: string | null | undefined): string | null {
  if (!value) return null;
  const keys = ['left', 'right', 'any', 'morning', 'afternoon', 'night'];
  return keys.includes(value) ? t(value) : value;
}

export default function ProfilePage() {
  const { t } = useT('profile');
  const { t: ts } = useT('settings');
  const uid = useSession().session?.user.id;
  const profile = useProfile(uid);
  const me = useMyProfile();

  if (profile.isLoading || me.isLoading || !profile.data || !me.data) {
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

  const p = profile.data;
  const d = me.data;
  const dominantHand = label(t, d.dominant_hand);
  const courtSide = label(t, d.court_side);
  const preferredTime = label(t, d.preferred_time);

  return (
    <div className="p-6">
      <ProfileHeader
        id={p.id}
        fullName={p.full_name}
        avatarPath={p.avatar_url}
        followingCount={Number(p.following_count ?? 0)}
        followersCount={Number(p.followers_count ?? 0)}
        actions={
          /* UX-PROF-06: the Edit action goes — "there is no second place to edit the same data".
             Editing lives in Settings now, which this button already reaches. */
          <Button asChild variant="secondary">
            <Link href="/app/settings">{ts('title')}</Link>
          </Button>
        }
      />

      {/* This page has no stats grid — header, then Preferences. Badges get their own card rather
          than a grid built to hold one thing, so your own badges are visible on your own profile. */}
      <BadgeCard userId={d.id} />

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
    </div>
  );
}
