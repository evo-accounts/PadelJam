'use client';
import { useFollow, useUnfollow } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';

export function FollowButton({
  targetId,
  isFollowing,
  size,
}: {
  targetId: string;
  isFollowing: boolean;
  /** `sm` for the follow-list rows, where the control sits beside a name rather than under one. */
  size?: 'default' | 'sm';
}) {
  const { t } = useT('profile');
  const follow = useFollow();
  const unfollow = useUnfollow();
  const busy = follow.isPending || unfollow.isPending;
  return (
    <Button
      variant={isFollowing ? 'outline' : 'default'}
      size={size}
      disabled={busy}
      onClick={() => (isFollowing ? unfollow.mutate(targetId) : follow.mutate(targetId))}
    >
      {isFollowing ? t('unfollow') : t('follow')}
    </Button>
  );
}
