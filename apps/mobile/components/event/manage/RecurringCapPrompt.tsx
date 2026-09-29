/**
 * Turning "Repeat every week" on hit the community's recurring-events cap (set_event_recurrence →
 * `recurring_events`): the shared UpgradePrompt (UX-GLOB-10), as the create wizard raises it. The
 * organizer is not necessarily a community admin, so "See plans" is offered only to an admin.
 */
import { useCommunityMembers } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';

import { UpgradePrompt } from '@/components/community/UpgradePrompt';

export function RecurringCapPrompt({ communityId, onClose }: { communityId: string; onClose: () => void }) {
  const { t } = useT('community');
  const uid = useSession().session?.user.id;
  const { data: members } = useCommunityMembers(communityId);
  const canManage = members?.find((m) => m.user_id === uid)?.role === 'admin';
  return (
    <UpgradePrompt
      visible
      onClose={onClose}
      communityId={communityId}
      canManage={canManage}
      message={t('upgradeRecurringCap')}
    />
  );
}
