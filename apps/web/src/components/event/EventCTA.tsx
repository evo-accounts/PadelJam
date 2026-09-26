'use client';
/**
 * The event page's bottom area (UX-JEVT-03/04) — what it shows is decided by `bottomState` in
 * `@padel/utils`, the same table mobile reads. Leaving is never here: it lives in the ⋯ menu, and
 * past the 12h deadline it opens the contact-the-organizer dialog instead (UX-JEVT-05).
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
  isTeam,
  organizerPlaying,
  organizerWaiting,
  canJoinAsPlayer,
  scheduled,
  countdownMs,
  inviter,
  busy,
  error,
  onJoin,
  onLeaveWaitlist,
  onAccept,
  onDecline,
}: {
  bottom: BottomState;
  eventId: string;
  isTeam: boolean;
  /** Organizer only: they also hold a player's place. */
  organizerPlaying: boolean;
  /** Organizer only: they tried to play on a full event and are on its waiting list. */
  organizerWaiting: boolean;
  /** Organizer only: not playing, and joining is still open. */
  canJoinAsPlayer: boolean;
  /** Organizer only: the event is still scheduled (Start, Edit and joining apply). */
  scheduled: boolean;
  /** Time left to the join cut-off, for the countdown. */
  countdownMs: number;
  inviter: PersonLite | null;
  busy: boolean;
  error: string | null;
  onJoin: () => void;
  onLeaveWaitlist: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useT('event');
  const partnerHref = `/app/event/${eventId}/partner-requests`;
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
    case 'organizer':
      // UX-MEVT-01 owns this area; unchanged here except that leaving moved into ⋯.
      body = (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm font-medium">
            {organizerPlaying ? t('organizerPlayingBadge') : t('organizerBadge')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {scheduled ? (
              <Button asChild>
                <Link href={`/app/event/${eventId}/live`}>{t('startCta')}</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/app/event/${eventId}/manage`}>{t('manageCta')}</Link>
            </Button>
            {scheduled ? (
              <Button asChild variant="outline">
                <Link href={`/app/event/${eventId}/edit`}>{t('editTitle')}</Link>
              </Button>
            ) : null}
            {canJoinAsPlayer ? (
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
            {/* An organizer who tried to play on a full event is waiting like anyone else. */}
            {organizerWaiting ? (
              <Button variant="outline" disabled={busy} onClick={onLeaveWaitlist}>
                {t('leaveWaitlistCta')}
              </Button>
            ) : null}
          </div>
        </div>
      );
      break;
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
            <Button variant="outline" disabled={busy} onClick={onDecline} data-testid="event-decline">
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
          <p className="flex-1 text-sm text-muted-foreground">{t('noSpotsLine')}</p>
          <Button className="flex-1" disabled={busy} onClick={onJoin} data-testid="event-join-waitlist">
            {t('waitlistCta')}
          </Button>
        </div>
      );
      break;
    case 'waiting_list':
      body = (
        <Button variant="outline" className="w-full" disabled={busy} onClick={onLeaveWaitlist}>
          {t('leaveWaitlistCta')}
        </Button>
      );
      break;
    case 'team_entry':
    case 'interested':
      // M5 / W3 (UX-JEVT-09..14) redesign the team flow; this only re-homes the existing entry.
      body = (
        <Button asChild className="w-full">
          <Link href={partnerHref}>{t('teamJoinCta')}</Link>
        </Button>
      );
      break;
    case 'closed':
      body = <p className="py-2 text-center text-sm text-muted-foreground">{t('eventClosedLine')}</p>;
      break;
    case 'going':
      body = null;
      break;
  }

  if (body == null && errLine == null) return null;
  return (
    <div
      className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-2 border-t bg-card px-4 pt-3 pb-4 sm:-mx-6 sm:px-6"
      data-testid="event-bottom-area"
    >
      {body}
      {errLine}
    </div>
  );
}
