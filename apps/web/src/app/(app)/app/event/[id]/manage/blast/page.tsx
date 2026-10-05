'use client';
/**
 * Send blast (UX-MEVT-18) — a full page, reached from the dashboard's "Send blast" action and the
 * event page's chip. Available on every event the organizer runs, group-less ones included
 * (decision 6, 0124). The flow lives in `BlastComposer`; blasts already sent are listed below it.
 *
 * The locked "Customize your blast" opens the UpgradePrompt (UX-GLOB-10): on a group event it names
 * the community plan (an admin is told where to change it); on a group-less event the organizer's
 * own account plan, Jammer+.
 */
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useCommunityMembers, useEvent, useGroup } from '@padel/api';
import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { BlastComposer } from '@/components/event/manage/BlastComposer';
import { BlastHistory } from '@/components/event/manage/BlastHistory';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { Skeleton } from '@/components/ui/skeleton';

export default function EventBlastPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  const event = useEvent(id);
  const group = useGroup(event.data?.group_id);
  const members = useCommunityMembers(group.data?.community_id);
  const [upgrade, setUpgrade] = useState(false);
  const back = `/app/event/${id}/manage`;
  const title = t('blastTitle');

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  const e = event.data;
  if (e == null || uid == null || uid !== e.organizer_id) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <GroupPageTitle title={title} fallbackHref={back} />
        <p className="p-8 text-center text-sm text-muted-foreground" data-testid="blast-forbidden">
          {t('forbidden')}
        </p>
      </div>
    );
  }

  const groupless = e.group_id == null;
  const isCommunityAdmin = members.data?.find((m) => m.user_id === uid)?.role === 'admin';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 sm:px-6 sm:pt-6">
      <GroupPageTitle title={title} fallbackHref={back} />
      <BlastComposer eventId={id} onLocked={() => setUpgrade(true)} onDone={() => router.push(back)} />
      <div className="pb-8">
        <BlastHistory eventId={id} />
      </div>
      <UpgradePrompt
        open={upgrade}
        onClose={() => setUpgrade(false)}
        title={groupless ? t('blastUpgradeTitleAccount') : t('blastUpgradeTitleCommunity')}
        canManage={groupless || isCommunityAdmin}
        body={groupless ? t('blastUpgradeBodyAccount') : undefined}
      />
    </div>
  );
}
