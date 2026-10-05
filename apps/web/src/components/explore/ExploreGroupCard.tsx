'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { useJoinGroup, type ExploreGroup, type SearchGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { GroupThumb } from '@/components/group/GroupThumb';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { ExploreCard, RESOLVED, actionErrorText, actionWidth, distanceLabel, type CardOrientation } from './ExploreCard';

/**
 * A group on Explore (UX-EXPL-02). Groups are public or private only (D1), so the card offers
 * Join, never Request: Join → Joined, and a group the viewer is already in reads Open. Joining
 * also brings the viewer into the parent community, so when that community has rules the join is
 * refused (`rules_acknowledgement_required`) and the card opens the group page, which asks for
 * them (UX-COMM-05). A group's distance is its community's (D2).
 */
export function ExploreGroupCard({
  group,
  orientation = 'vertical',
}: {
  /** A search row also names its community, shown as the first line (UX-EXPL-07). */
  group: ExploreGroup | SearchGroup;
  orientation?: CardOrientation;
}) {
  const { t } = useT('explore');
  const router = useRouter();
  const join = useJoinGroup();
  const [joined, setJoined] = useState(false);
  const href = `/app/group/${group.id}`;
  const width = actionWidth(orientation);

  const onJoin = () =>
    join.mutate(
      { groupId: group.id, communityId: group.community_id, ack: false },
      {
        onSuccess: () => {
          setJoined(true);
          toast(t('joinedToast', { name: group.name }));
        },
        onError: (e) => {
          if (e instanceof Error && e.message === 'rules_acknowledgement_required') router.push(href);
          else toast(actionErrorText(t, e), 'error');
        },
      },
    );

  let action: React.ReactNode;
  if (joined) {
    action = (
      <Button variant="secondary" size="sm" disabled className={cn(width, RESOLVED)} data-testid={`explore-group-joined-${group.id}`}>
        <Check aria-hidden />
        {t('joined')}
      </Button>
    );
  } else if (group.viewer_state === 'member' || group.is_private) {
    action = (
      <Button asChild variant="secondary" size="sm" className={width}>
        <Link href={href} data-testid={`explore-group-open-${group.id}`}>
          {t('open')}
        </Link>
      </Button>
    );
  } else {
    action = (
      <Button
        size="sm"
        className={width}
        loading={join.isPending}
        onClick={onJoin}
        aria-label={`${t('join')} ${group.name}`}
        data-testid={`explore-group-join-${group.id}`}
      >
        {t('join')}
      </Button>
    );
  }

  return (
    <ExploreCard
      orientation={orientation}
      href={href}
      title={group.name}
      media={
        <GroupThumb
          path={group.thumbnail_path}
          name={group.name}
          className={orientation === 'vertical' ? 'size-16 rounded-xl text-lg' : 'size-11'}
        />
      }
      meta={['community_name' in group ? group.community_name : null, group.description, distanceLabel(t, group.distance_m)]}
      action={action}
      testId={`explore-group-${group.id}`}
    />
  );
}
