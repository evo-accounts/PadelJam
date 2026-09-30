'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useJoinCommunity, type CommunityViewerState, type ExploreCommunity } from '@padel/api';
import { useT } from '@padel/i18n';
import { GroupThumb } from '@/components/group/GroupThumb';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { ExploreCard, RESOLVED, actionErrorText, actionWidth, distanceLabel, type CardOrientation } from './ExploreCard';

/**
 * A community on Explore (UX-EXPL-02), with the action its privacy and the viewer's standing call
 * for (D9):
 *
 *   none + public           Join     → Open once joined
 *   none + request_to_join  Request  → Requested
 *   requested               Requested (nothing to do but wait)
 *   member / invited        Open — an invitation is answered on the community page
 *   private                 Open (a rail never offers one; the fallback is still safe)
 *
 * A community with rules is not joined from the card: its page asks for the acknowledgement
 * first (UX-COMM-05), so the card opens it — up front when the row says there are rules, and
 * again if `join_community` answers `rules_acknowledgement_required` anyway.
 */
export function ExploreCommunityCard({
  community,
  orientation = 'vertical',
}: {
  community: ExploreCommunity;
  orientation?: CardOrientation;
}) {
  const { t } = useT('explore');
  const router = useRouter();
  const join = useJoinCommunity(community.id);
  const [resolved, setResolved] = useState<CommunityViewerState | null>(null);
  const state = resolved ?? community.viewer_state;
  const href = `/app/community/${community.id}`;
  const id = community.id;
  const width = actionWidth(orientation);

  const onJoin = () => {
    if (community.cancellation_rules_enabled) {
      router.push(href);
      return;
    }
    join.mutate(false, {
      onSuccess: (result) => {
        setResolved(result === 'joined' ? 'member' : 'requested');
        toast(t(result === 'joined' ? 'joinedToast' : 'requestedToast', { name: community.name }));
      },
      onError: (e) => {
        if (e instanceof Error && e.message === 'rules_acknowledgement_required') router.push(href);
        else toast(actionErrorText(t, e), 'error');
      },
    });
  };

  let action: React.ReactNode;
  if (state === 'requested') {
    action = (
      <Button variant="secondary" size="sm" disabled className={cn(width, RESOLVED)} data-testid={`explore-community-requested-${id}`}>
        {t('requested')}
      </Button>
    );
  } else if (state === 'member' || state === 'invited' || community.privacy === 'private') {
    action = (
      <Button asChild variant="secondary" size="sm" className={width}>
        <Link href={href} data-testid={`explore-community-open-${id}`}>
          {state === 'invited' ? t('invited') : t('open')}
        </Link>
      </Button>
    );
  } else {
    const label = community.privacy === 'request_to_join' ? t('request') : t('join');
    action = (
      <Button
        size="sm"
        className={width}
        loading={join.isPending}
        onClick={onJoin}
        aria-label={`${label} ${community.name}`}
        data-testid={`explore-community-join-${id}`}
      >
        {label}
      </Button>
    );
  }

  return (
    <ExploreCard
      orientation={orientation}
      href={href}
      title={community.name}
      media={
        <GroupThumb
          path={community.thumbnail_path}
          name={community.name}
          className={orientation === 'vertical' ? 'size-16 rounded-xl text-lg' : 'size-11 rounded-lg'}
        />
      }
      meta={[community.location, distanceLabel(t, community.distance_m)]}
      action={action}
      testId={`explore-community-${id}`}
    />
  );
}
