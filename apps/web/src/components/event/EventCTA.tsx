'use client';
/**
 * The event page's bottom area (UX-JEVT-03/04) — what it shows is decided by `bottomState` in
 * `@padel/utils`, the same table mobile reads. A waiter offered a free spot (`claim`, decision 4)
 * gets "Leave waiting list" next to a primary "Confirm spot". Leaving is never here: it lives in the ⋯ menu, and
 * past the 12h deadline it opens the contact-the-organizer dialog instead (UX-JEVT-05).
 *
 * Team events (UX-JEVT-09/13): "Join" (`team_entry`) and an invitee's "Accept" call `onTeamJoin`,
 * which opens the Team Event dialog; a player looking for a partner (`interested`) gets the
 * interested line and "Edit response". The organizer's "Join as a player" is on the page's status
 * line (UX-MEVT-01), not here.
 */
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { formatCountdown, type BottomState } from '@padel/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { avatarUrl } from '@/lib/upload';
import type { PersonLite } from './EventDetailParts';

export function EventCTA({
  bottom,
  eventId,
  startHere,
  organizerWaiting,
  organizerCanClaim,
  organizerInterested,
  scheduled,
  countdownMs,
  teamCountdown,
  inviter,
  busy,
  error,
  onJoin,
  onLeaveWaitlist,
  onClaim,
  onAccept,
  onDecline,
  onTeamJoin,
  onEditResponse,
  onStart,
  startPending = false,
  pinned,
}: {
  bottom: BottomState;
  eventId: string;
  /** Organizer only: the scheduled time has come, so Start event is the primary action here. */
  startHere: boolean;
  /** Organizer only: they tried to play on a full event and are on its waiting list. */
  organizerWaiting: boolean;
  /** Organizer only: waiting, and a spot is free for them — "Confirm spot" (decision 4). */
  organizerCanClaim: boolean;
  /** Organizer only: they play, and are still looking for a partner (UX-JEVT-13). */
  organizerInterested: boolean;
  /** Organizer only: the event is still scheduled (Start and the player states apply). */
  scheduled: boolean;
  /** Time left to the join cut-off, for the countdown. */
  countdownMs: number;
  /** A team event's "Join" shows the countdown too (`team_entry` carries no flag of its own). */
  teamCountdown: boolean;
  inviter: PersonLite | null;
  busy: boolean;
  error: string | null;
  onJoin: () => void;
  onLeaveWaitlist: () => void;
  /** Take the free spot from the waiting list (decision 4). */
  onClaim: () => void;
  onAccept: () => void;
  onDecline: () => void;
  /** Team events: open the Team Event dialog (UX-JEVT-09). */
  onTeamJoin: () => void;
  /** An interested player's "Edit response" (UX-JEVT-13). */
  onEditResponse: () => void;
  /** Organizer: Start event — the start flow's check and dialogs (UX-MEVT-23). */
  onStart?: () => void;
  startPending?: boolean;
  /** Pinned above the actions: the organizer's pending actions card (UX-MEVT-24). */
  pinned?: React.ReactNode;
}) {
  const { t } = useT('event');
  const errLine = error ? (
    <p className="text-sm text-destructive" role="alert">
      {error}
    </p>
  ) : null;

  let body: React.ReactNode = null;
  switch (bottom.kind) {
    case 'live':
      body = (
        <Button asChild className="w-full">
          <Link href={`/app/event/${eventId}/live`}>
            {bottom.completed ? t('viewResultsCta') : t('viewMatchesCta')}
          </Link>
        </Button>
      );
      break;
    case 'organizer': {
      // UX-MEVT-01: management lives in the header (settings → Manage Event) and Join as a player
      // in the status line. What is left here is Start event — only once the scheduled time has
      // come; before that it is on Manage Event — and the organizer's own player states.
      const rows: React.ReactNode[] = [];
      if (scheduled) {
        if (startHere) {
          rows.push(
            <Button
              key="start"
              disabled={busy || startPending}
              aria-busy={startPending || undefined}
              onClick={onStart}
              data-testid="event-start"
            >
              {t('startCta')}
            </Button>,
          );
        }
        // An organizer who plays and is still looking for a partner (UX-JEVT-13).
        if (organizerInterested) {
          rows.push(
            <Button key="edit" variant="secondary" disabled={busy} onClick={onEditResponse} data-testid="event-edit-response">
              {t('editResponseCta')}
            </Button>,
          );
        }
        // An organizer who tried to play on a full event is waiting like anyone else.
        if (organizerWaiting && organizerCanClaim) {
          rows.push(
            <Button key="claim" disabled={busy} onClick={onClaim} data-testid="event-confirm-spot">
              {t('confirmSpotCta')}
            </Button>,
          );
        }
        if (organizerWaiting) {
          rows.push(
            <Button key="leave" variant="secondary" disabled={busy} onClick={onLeaveWaitlist}>
              {t('leaveWaitlistCta')}
            </Button>,
          );
        }
      }
      body = rows.length > 0 ? <div className="grid gap-2 sm:grid-cols-2">{rows}</div> : null;
      break;
    }
    case 'invited':
      body = (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2" data-testid="event-inviter">
            {inviter ? (
              <Avatar className="size-8">
                <AvatarImage src={avatarUrl(inviter.avatar_url) ?? undefined} alt="" />
                <AvatarFallback className="text-xs">{(inviter.full_name ?? '?').slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            ) : null}
            <p className="flex-1 font-medium">
              {inviter?.full_name ? t('invitedBanner', { name: inviter.full_name }) : t('invitedBannerGeneric')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={onDecline} data-testid="event-decline">
              {t('declineCta')}
            </Button>
            <Button disabled={busy} onClick={onAccept} data-testid="event-accept">
              {t('acceptCta')}
            </Button>
          </div>
        </div>
      );
      break;
    case 'open':
      body = (
        <div className="flex items-center gap-3">
          {bottom.countdown ? (
            <p className="flex-1 text-sm font-medium text-primary" data-testid="event-join-countdown">
              {t('joinCountdown', { time: formatCountdown(countdownMs) })}
            </p>
          ) : null}
          <Button className="flex-1" disabled={busy} onClick={onJoin} data-testid="event-join">
            {t('joinCta')}
          </Button>
        </div>
      );
      break;
    case 'full':
      body = (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-muted-foreground">
            {t(bottom.waitersAhead ? 'waitersAheadLine' : 'noSpotsLine')}
          </p>
          <Button className="flex-1" disabled={busy} onClick={onJoin} data-testid="event-join-waitlist">
            {t('waitlistCta')}
          </Button>
        </div>
      );
      break;
    case 'waiting_list':
      body = (
        <Button
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={onLeaveWaitlist}
          data-testid="event-leave-waitlist"
        >
          {t('leaveWaitlistCta')}
        </Button>
      );
      break;
    case 'claim':
      // A spot is free and every waiter was told at once: the first to confirm takes it.
      body = (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm font-medium text-primary" data-testid="event-spot-open">
            {t('spotOpenLine')}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="secondary" disabled={busy} onClick={onLeaveWaitlist} data-testid="event-leave-waitlist">
              {t('leaveWaitlistCta')}
            </Button>
            <Button disabled={busy} onClick={onClaim} data-testid="event-confirm-spot">
              {t('confirmSpotCta')}
            </Button>
          </div>
        </div>
      );
      break;
    case 'team_entry':
      // UX-JEVT-09: "Join" like any event; whether you have a partner is the next question.
      body = (
        <div className="flex items-center gap-3">
          {teamCountdown ? (
            <p className="flex-1 text-sm font-medium text-primary" data-testid="event-join-countdown">
              {t('joinCountdown', { time: formatCountdown(countdownMs) })}
            </p>
          ) : null}
          <Button className="flex-1" disabled={busy} onClick={onTeamJoin} data-testid="event-team-join">
            {t('joinCta')}
          </Button>
        </div>
      );
      break;
    case 'interested':
      body = (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground" data-testid="event-interested-line">
            {t('interestedLine')}
          </p>
          <Button className="w-full" disabled={busy} onClick={onEditResponse} data-testid="event-edit-response">
            {t('editResponseCta')}
          </Button>
        </div>
      );
      break;
    case 'closed':
      body = <p className="py-2 text-center text-sm text-muted-foreground">{t('eventClosedLine')}</p>;
      break;
    case 'going':
      body = null;
      break;
  }

  if (body == null && errLine == null && pinned == null) return null;
  return (
    <div
      className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-2 border-t bg-card px-4 pt-3 pb-4 sm:-mx-6 sm:px-6"
      data-testid="event-bottom-area"
    >
      {pinned}
      {body}
      {errLine}
    </div>
  );
}
