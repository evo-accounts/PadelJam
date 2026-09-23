'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useProfile, useBlock, useFollow, useMyBlocks, useUnblock, useUnfollow } from '@padel/api';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { FollowButton } from '@/components/profile/FollowButton';
import { ReportDialog } from '@/components/profile/ReportDialog';
import { ProfileGroups, ProfilePreferences, ProfileResults } from '@/components/profile/ProfileSections';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

export default function OtherProfilePage() {
  const { t } = useT('profile');
  const { id } = useParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const router = useRouter();
  const block = useBlock();
  const unblock = useUnblock();
  const follow = useFollow();
  const unfollow = useUnfollow();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t('more')}>
                    …
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* Mirrors UX-PROF-02's sheet, including Share, which web never offered. */}
                  <DropdownMenuItem
                    onSelect={() => void navigator.clipboard?.writeText(window.location.href)}
                  >
                    {t('share')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => (d.is_following ? unfollow : follow).mutate(id)}
                  >
                    {d.is_following ? t('unfollow') : t('follow')}
                  </DropdownMenuItem>
                  {/* Only once you follow them — the same gate as mobile, for the same reason. */}
                  {d.is_following ? (
                    <DropdownMenuItem onSelect={() => router.push('/app/chat')}>
                      {t('message')}
                    </DropdownMenuItem>
                  ) : null}
                  {/* Was a bare menu item that blocked on click with no confirmation at all. */}
                  <DropdownMenuItem onSelect={() => setBlockOpen(true)}>{t('block')}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setReportOpen(true)}>{t('report')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
        {d.description ? <p className="px-6 text-sm text-muted-foreground">{d.description}</p> : null}
        {d.location_text ? (
          <p className="px-6 text-sm text-muted-foreground">{d.location_text}</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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

      {/* UX-PROF-03: a confirmation that states the consequence. */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('blockTitle')}</DialogTitle>
            <DialogDescription>{t('blockBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={block.isPending}
              onClick={() =>
                block.mutate(id, {
                  onSuccess: () => {
                    setBlockOpen(false);
                    router.push('/app/profile');
                  },
                })
              }
            >
              {t('block')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportDialog targetId={id} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}
