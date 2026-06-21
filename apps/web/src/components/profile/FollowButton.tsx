'use client';
import { useFollow, useUnfollow } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';

export function FollowButton({ targetId, isFollowing }: { targetId: string; isFollowing: boolean }) {
  const { t } = useT('profile');
  const follow = useFollow();
  const unfollow = useUnfollow();
  const busy = follow.isPending || unfollow.isPending;
  return (
    <Button
      variant={isFollowing ? 'outline' : 'default'}
      disabled={busy}
      onClick={() => (isFollowing ? unfollow.mutate(targetId) : follow.mutate(targetId))}
    >
      {isFollowing ? t('unfollow') : t('follow')}
    </Button>
  );
}
