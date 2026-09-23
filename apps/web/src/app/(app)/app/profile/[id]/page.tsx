'use client';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useProfile, useMyBlocks, useUnblock } from '@padel/api';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileGroups, ProfilePreferences, ProfileResults } from '@/components/profile/ProfileSections';
import { ProfileActionsMenu } from '@/components/profile/ProfileActionsMenu';
import { BadgeStatCard } from '@/components/profile/ProfileBadges';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function OtherProfilePage() {
  const { t } = useT('profile');
  const { id } = useParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const router = useRouter();
  const unblock = useUnblock();

  const isSelf = !!uid && id === uid;
  const q = useProfile(isSelf ? undefined : id);
  // Only meaningful when the profile comes back empty — see below.
  const blocks = useMyBlocks();

  // Viewing your own profile here redirects to the canonical own-profile route.
  if (isSelf) {
    router.replace('/app/profile');
    return null;
  }

  if (q.isLoading) {
    return (
      <div className="space-y-4 p-6">
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

  /**
   * `get_player_profile` returns nothing for a block in EITHER direction, so an empty result
   * cannot say which situation this is. `list_my_blocks` can: a profile YOU blocked collapses to
   * name and Unblock. Anything else — a deleted profile, or someone who blocked YOU — gets the
   * neutral unavailable copy, with no identity and no mention of unblocking.
   */
  if (!q.data) {
    const blocked = (blocks.data ?? []).find((b) => b.id === id);
    if (blocked) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6">
          <h1 className="text-xl font-semibold">{blocked.full_name}</h1>
          <Button
            variant="outline"
            disabled={unblock.isPending}
            onClick={() => unblock.mutate(id, { onSuccess: () => void q.refetch() })}
          >
            {t('unblock')}
          </Button>
        </div>
      );
    }
    // Neutral on purpose: this covers a deleted profile as much as someone who blocked you, and
    // telling either of them to "unblock this player" would be wrong.
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-muted-foreground">
        {t('notAvailable')}
      </div>
    );
  }

  const d = q.data;

  return (
    <div className="space-y-6 p-6">
      <div>
        <ProfileHeader
          id={id}
          fullName={d.full_name}
          avatarPath={d.avatar_url}
          followingCount={Number(d.following_count)}
          followersCount={Number(d.followers_count)}
          actions={
            <>
              <FollowButton targetId={id} isFollowing={d.is_following} />
              {/* UX-PROF-02's menu, shared with every follow-list row (UX-PROF-05). */}
              <ProfileActionsMenu
                person={{ id, full_name: d.full_name, is_following: d.is_following }}
                onBlocked={() => router.push('/app/profile')}
              />
            </>
          }
        />
        {d.description ? <p className="px-6 text-sm text-muted-foreground">{d.description}</p> : null}
        {d.location_text ? (
          <p className="px-6 text-sm text-muted-foreground">{d.location_text}</p>
        ) : null}
      </div>

      {/* Three columns now, not two — the third is badges. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-semibold">{d.played_matches}</p>
            <p className="text-sm text-muted-foreground">{t('playedMatches')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-semibold">{d.best_position ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{t('bestPosition')}</p>
          </CardContent>
        </Card>
        <BadgeStatCard userId={id} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('preferences')}</h2>
        <ProfilePreferences
          dominantHand={d.dominant_hand}
          courtSide={d.court_side}
          preferredTime={d.preferred_time}
        />
      </section>

      <ProfileGroups userId={id} />
      <ProfileResults userId={id} />

    </div>
  );
}
