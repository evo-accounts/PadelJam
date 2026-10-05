'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useFollowPlayer, type ExplorePlayer, type PlayerViewerState, type SearchPlayer } from '@padel/api';
import { useT } from '@padel/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { avatarUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { ExploreCard, RESOLVED, actionErrorText, actionWidth, type CardOrientation } from './ExploreCard';

/**
 * A player on Explore (UX-EXPL-02): avatar, name, what you share, and Follow → Following (D9).
 *
 * Following goes through `follow_player` (0128), which refuses yourself and a block in either
 * direction; the card keeps the state the server returned until the list refetches — and since
 * the rails leave out people you follow (D8), that refetch usually takes the card away.
 * Unfollowing is not offered here; it stays on the profile.
 *
 * Search results (UX-EXPL-06) use it too: a search row has no `shared_count`, so that line is
 * simply absent there.
 */
export function PlayerCard({
  player,
  orientation = 'vertical',
}: {
  player: ExplorePlayer | SearchPlayer;
  orientation?: CardOrientation;
}) {
  const { t } = useT('explore');
  const follow = useFollowPlayer();
  const [resolved, setResolved] = useState<PlayerViewerState | null>(null);
  const state = resolved ?? player.viewer_state;
  const initials = (player.full_name ?? '?').slice(0, 2).toUpperCase();

  const onFollow = () =>
    follow.mutate(player.id, {
      onSuccess: (next) => setResolved(next),
      onError: (e) => toast(actionErrorText(t, e), 'error'),
    });

  const action =
    state === 'following' ? (
      <Button variant="secondary" size="sm" disabled className={cn(actionWidth(orientation), RESOLVED)} data-testid={`explore-player-following-${player.id}`}>
        <Check aria-hidden />
        {t('following')}
      </Button>
    ) : (
      <Button
        size="sm"
        className={actionWidth(orientation)}
        loading={follow.isPending}
        onClick={onFollow}
        aria-label={`${t('follow')} ${player.full_name}`}
        data-testid={`explore-player-follow-${player.id}`}
      >
        {t('follow')}
      </Button>
    );

  return (
    <ExploreCard
      orientation={orientation}
      href={`/app/profile/${player.id}`}
      title={player.full_name}
      media={
        <Avatar className={orientation === 'vertical' ? 'size-16' : 'size-11'}>
          <AvatarImage src={avatarUrl(player.avatar_url) ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      }
      meta={['shared_count' in player && player.shared_count > 0 ? t('inCommon', { count: player.shared_count }) : null]}
      action={action}
      testId={`explore-player-${player.id}`}
    />
  );
}
