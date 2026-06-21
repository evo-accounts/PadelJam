'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { formatCountdown } from '@padel/utils';
import type { ParticipationState } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CTAEvent {
  id: string;
  status: string;
  specification: string;
  starts_at: string | null;
}
type Part = { user_id: string | null; status: string; is_standby: boolean; waiting_list_position: number | null };
type Inv = { invitee_id: string | null; invited_by: string };

export function EventCTA({
  event,
  state,
  nowMs,
  inviterName,
  busy,
  error,
  onJoin,
  onLeave,
  onLeaveWaitlist,
  onAccept,
  onDecline,
}: {
  event: CTAEvent;
  state: ParticipationState<Part, Inv>;
  nowMs: number;
  inviterName: string | null;
  busy: boolean;
  error: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onLeaveWaitlist: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useT('event');
  const { me, myInvite, isOrganizer, totalIn, totalCapacity, joinClosed, leaveLocked, joinCutoffMs } = state;
  const isTeam = event.specification === 'team';
  const partnerHref = `/app/event/${event.id}/partner-requests`;

  if (event.status !== 'scheduled') {
    return (
      <div className="flex flex-col gap-2">
        <Button disabled className="w-full sm:w-auto">
          {event.status === 'completed' ? t('viewResultsCta') : t('viewMatchesCta')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('comingSoon')}</p>
      </div>
    );
  }

  const leaveHint = (
    <p className="text-xs text-muted-foreground">
      {t('leaveByHint', { when: new Date(state.leaveCutoffMs).toLocaleString() })}
    </p>
  );
  const errLine = error ? <p className="text-sm text-destructive">{error}</p> : null;

  if (isOrganizer) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Badge variant="secondary">{me ? t('organizerPlayingBadge') : t('organizerBadge')}</Badge>
        <Button disabled className="w-full sm:w-auto">
          {t('manageCta')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('comingSoon')}</p>
        {me == null && !joinClosed ? (
          isTeam ? (
            <Button asChild variant="outline">
              <Link href={partnerHref}>{t('joinAsPlayerCta')}</Link>
            </Button>
          ) : (
            <Button variant="outline" disabled={busy} onClick={onJoin}>
              {t('joinAsPlayerCta')}
            </Button>
          )
        ) : null}
        {me != null && !leaveLocked ? (
          <>
            <Button variant="outline" disabled={busy} onClick={onLeave}>
              {t('leaveAsPlayerCta')}
            </Button>
            {leaveHint}
          </>
        ) : null}
        {errLine}
      </div>
    );
  }

  if (me) {
    if (me.status === 'waiting_list') {
      return (
        <div className="flex flex-col items-start gap-2">
          <Badge variant="secondary">{t('waitlistBadge', { pos: me.waiting_list_position ?? 0 })}</Badge>
          <Button variant="outline" disabled={busy} onClick={onLeaveWaitlist}>
            {t('leaveWaitlistCta')}
          </Button>
          {errLine}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-start gap-2">
        <Badge variant="secondary">{me.is_standby ? t('standbyBadge') : t('goingBadge')}</Badge>
        {leaveLocked ? (
          <p className="text-sm text-muted-foreground">{t('leaveLockedBody')}</p>
        ) : (
          <>
            <Button variant="outline" disabled={busy} onClick={onLeave}>
              {t('leaveCta')}
            </Button>
            {leaveHint}
          </>
        )}
        {errLine}
      </div>
    );
  }

  if (myInvite) {
    if (joinClosed) return <p className="text-sm text-muted-foreground">{t('joiningClosed')}</p>;
    return (
      <div className="flex flex-col items-start gap-2">
        <Badge variant="secondary">
          {inviterName ? t('invitedBanner', { name: inviterName }) : t('invitedBannerGeneric')}
        </Badge>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={onDecline}>
            {t('declineCta')}
          </Button>
          <Button disabled={busy} onClick={onAccept}>
            {t('acceptCta')}
          </Button>
        </div>
        {errLine}
      </div>
    );
  }

  if (joinClosed) return <p className="text-sm text-muted-foreground">{t('joiningClosed')}</p>;
  if (isTeam) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button asChild>
          <Link href={partnerHref}>{t('teamJoinCta')}</Link>
        </Button>
      </div>
    );
  }
  const joinLabel = totalIn >= totalCapacity ? t('waitlistCta') : t('joinCta');
  return (
    <div className="flex flex-col items-start gap-2">
      {Number.isFinite(joinCutoffMs) ? (
        <p className="text-xs text-muted-foreground">
          {t('joinCountdown', { time: formatCountdown(joinCutoffMs - nowMs) })}
        </p>
      ) : null}
      <Button disabled={busy} onClick={onJoin}>
        {joinLabel}
      </Button>
      {errLine}
    </div>
  );
}
