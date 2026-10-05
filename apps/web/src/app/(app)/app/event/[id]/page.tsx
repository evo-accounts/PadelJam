'use client';
/**
 * The event page (UX-JEVT-02..07), web's twin of mobile's `app/event/[id]/index.tsx`. One body for
 * every viewer; only the top banner and the bottom area change with the viewer's state — decided
 * by `bottomState` / `bannerState` / `canLeave` in `@padel/utils`, the table mobile reads too.
 *
 *   header   back · ⋯ (Share, Add to calendar, Leave event). The organizer gets the settings icon
 *            (→ Manage Event, UX-MEVT-03) instead, and both side by side when they play.
 *   status   organizer only (UX-MEVT-01): "You are organizing" + Join as a player, or
 *            "You are organizing and going!"
 *   banner   You are going / stand-by / waiting list / interested
 *   body     image, name + date · time · place, Players card, type + group badges, description,
 *            Courts / Scoring / Fee, Organizer card, Location card — the same for the organizer,
 *            who also gets a "Manage players" row and a chip row (Payment list, Send blast,
 *            Preferences)
 *   bottom   invited · join (+ countdown) · full · waiting list (+ Confirm spot when one is free —
 *            decision 4) · closed · organizer actions · team entry (Join → the Team Event dialog,
 *            UX-JEVT-09) · interested (Edit response, UX-JEVT-13). The organizer's Start event
 *            (from the scheduled time, UX-MEVT-23) runs the start flow — the server's check, then
 *            a blocking or a warning dialog — and their pending actions card (UX-MEVT-24) is
 *            pinned above the actions while the event is scheduled.
 *
 * Team events: "Join", an invitee's "Accept" and the organizer's "Join as a player" all open the
 * Team Event dialog — I have a partner (`have-partner`, UX-JEVT-10) or I need a partner
 * (`need-partner`, UX-JEVT-11). Those pages do the confirming; accepting a team invitation never
 * silently marks anyone interested (B9). A lone occupant whose partner left (`invited`, decision 1)
 * is back at the team entry state.
 *
 * The roster is live (`useEventRealtime`), so a freed spot turns the waiting list's bottom area into
 * "Confirm spot" without a reload.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  bannerState,
  bottomState,
  canClaimWaitlistSpot,
  canLeave,
  eventPlace,
  joinWaitlistReason,
  participationState,
  showJoinCountdown,
} from '@padel/utils';
import {
  eventStatusKey,
  useAcceptEventInvitation,
  useClaimWaitlistSpot,
  useDeclineEventInvitation,
  useEnsureChannel,
  useEvent,
  useEventInvitations,
  useEventParticipants,
  useEventRealtime,
  useEventResultSummary,
  useEventSeries,
  useEventTeams,
  useJoinEvent,
  useLeaveEvent,
  useLeaveWaitingList,
  useMyProfile,
} from '@padel/api';
import { EventCTA } from '@/components/event/EventCTA';
import { useStartFlow } from '@/components/event/manage/useStartFlow';
import { PendingActionsCard } from '@/components/event/PendingActionsCard';
import { pendingActions, teamsIncomplete } from '@/components/event/pendingActions';
import {
  EventNoAccess,
  eventSubtitle,
  InfoWidgets,
  JoinedDialog,
  LocationCard,
  PersonCard,
  PlayersCard,
  StateBanner,
} from '@/components/event/EventDetailParts';
import { EventMenu, type EventMenuDialog } from '@/components/event/EventMenu';
import { EventResultTable, type EventResultRow } from '@/components/event/EventResultTable';
import { EventThumb } from '@/components/event/EventThumb';
import { EditResponseDialog, TeamEventDialog, type EditChoice, type TeamChoice } from '@/components/event/TeamDialogs';
import { GroupConfirm } from '@/components/group/GroupConfirm';
import { BackButton } from '@/components/group/GroupHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { downloadEventIcs, shareEvent } from '@/lib/eventLinks';
import { openDirectChannel } from '@/lib/streamDm';
import { useNow } from '@/lib/useNow';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useT('event');
  const { t: tc } = useT('chat');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  useEventRealtime(id);

  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const invitations = useEventInvitations(id);
  const result = useEventResultSummary(id);
  // "Recurring" = in a series that is still active (a series switched off keeps its series_id).
  const series = useEventSeries(id);
  const teams = useEventTeams(id);
  const startFlow = useStartFlow(id, event.data);
  // Only a mixed event reads it: the viewer's own gender decides whose waiters queue ahead of them.
  const myProfile = useMyProfile();

  const joinEvent = useJoinEvent();
  const leaveEvent = useLeaveEvent();
  const leaveWaitlist = useLeaveWaitingList(id);
  const claimSpot = useClaimWaitlistSpot(id);
  const acceptInvite = useAcceptEventInvitation();
  const declineInvite = useDeclineEventInvitation(id);
  const ensureChannel = useEnsureChannel();

  // A ticking clock: the countdown and the deadline-gated actions stay live (B18 — it used to be
  // read once at mount and freeze).
  const nowMs = useNow();
  const [busy, setBusy] = useState(false);
  const [ctaError, setCtaError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<EventMenuDialog>(null);
  const [joinedOpen, setJoinedOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [leaveInterestedOpen, setLeaveInterestedOpen] = useState(false);
  const [leavePairWaitlistOpen, setLeavePairWaitlistOpen] = useState(false);

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  // A failed request is not "no access": RLS answers a hidden event with no row (data === null),
  // and only that lands on the no-access page. Anything else can be retried.
  if (event.isError) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center" role="alert" data-testid="event-load-error">
        <p className="text-sm text-muted-foreground">{t('loadError')}</p>
        <Button variant="secondary" onClick={() => void event.refetch()}>
          {t('retryCta')}
        </Button>
      </div>
    );
  }
  if (!event.data) return <EventNoAccess />;

  const e = event.data;
  const parts = participants.data ?? [];
  const ps = participationState(e, parts, invitations.data ?? [], uid, nowMs);
  const { me, myInvite, isOrganizer, joinClosed, leaveLocked, joinCutoffMs } = ps;
  const status = e.status;
  const lang = i18n.language;
  const place = eventPlace(e);
  const organizer = e.organizer;

  // Decision 4: nobody is confirmed automatically — when a spot frees, every waiter who could take
  // it is offered it and the first to confirm wins. Mirrors the server's _waiter_can_claim.
  const claimable =
    status === 'scheduled' && !joinClosed && canClaimWaitlistSpot(e.specification, ps.totalCapacity, parts, me);
  // Decision 4: while anyone who could take the spot is waiting, a newcomer's Join queues behind
  // them — so the bottom area says "Join waiting list" then too, not only when the event is full.
  // A mixed event needs the viewer's gender: until the profile arrives, answer nothing rather than
  // a wrong "Join waiting list" from counting every waiter.
  const waitlistReason =
    e.specification === 'mixed' && myProfile.isLoading
      ? null
      : joinWaitlistReason(e.specification, ps.totalCapacity, parts, myProfile.data?.gender);
  const bottom = bottomState({
    status,
    specification: e.specification,
    isOrganizer,
    me,
    hasInvite: myInvite != null,
    joinClosed,
    full: waitlistReason != null,
    waitersAhead: waitlistReason === 'waiters',
    countdown: showJoinCountdown(joinCutoffMs, nowMs),
    claimable,
  });
  const bannerKind = bannerState(status, me);
  // Decision 1: a team player whose partner left is back to `invited`, holding no spot — for the
  // organizer too, who then sees "Join as a player" again rather than "organizing and playing".
  const loneTeamOccupant = e.specification === 'team' && me?.status === 'invited';
  const leaveOffered = canLeave(status, me, isOrganizer, leaveLocked);
  // UX-MEVT-01: which of the organizer's two states applies, and whether the status line offers
  // "Join as a player" (decision 8: the organizer is always eligible, whatever the role chosen at
  // creation). "Start event" is the primary action here only once the scheduled time has come;
  // before that it lives in Manage Event.
  const organizerGoing = isOrganizer && me?.status === 'confirmed' && !loneTeamOccupant;
  const organizerCanJoin = isOrganizer && status === 'scheduled' && !joinClosed && (me == null || loneTeamOccupant);
  const startHere = isOrganizer && status === 'scheduled' && nowMs >= new Date(e.starts_at).getTime();
  const recurring = e.series_id != null && series.data?.is_active === true;

  // Pending actions (UX-MEVT-24): organizer only, while scheduled.
  const confirmedRows = parts.filter((p) => p.status === 'confirmed');
  const pending =
    isOrganizer && status === 'scheduled'
      ? pendingActions({
          eventId: id,
          specification: e.specification,
          openSpots: ps.totalCapacity - ps.totalIn,
          teamsIncomplete: teamsIncomplete(
            confirmedRows.map((p) => p.id),
            teams.data ?? [],
          ),
          feeEnabled: e.entrance_fee_enabled,
          unpaid: confirmedRows.filter((p) => !p.has_paid).length,
          hasLocation: e.has_location,
          courtsReserved: e.courts_reserved,
        })
      : [];

  // --- Body values ---
  const scoringLabel = t(`scoring${cap(e.scoring_mode)}Label`);
  const scoringText = e.scoring_mode === 'classic' ? scoringLabel : `${scoringLabel} · ${e.scoring_value}`;
  const feeText = e.entrance_fee_enabled
    ? e.entrance_fee_method != null
      ? `${e.entrance_fee_amount ?? 0} · ${t(`fee${cap(e.entrance_fee_method)}Label`)}`
      : `${e.entrance_fee_amount ?? 0}`
    : t('feeFree');
  const isTeam = e.specification === 'team';
  // A team event announces itself (UX-JEVT-09): the format badge names the team format.
  const badges = [
    `${t(`type${cap(e.event_type)}Label`)} · ${isTeam ? t('teamFormatBadge') : t(`spec${cap(e.specification)}Label`)}`,
    e.group?.name ?? (e.group_id == null ? t('groupBadgeNone') : null),
  ].filter((b): b is string => b != null);
  // Confirmed regulars first, then stand-by: the three photos are the people surely playing.
  const confirmedPeople = parts
    .filter((p) => p.status === 'confirmed')
    .sort((a, b) => Number(a.is_standby) - Number(b.is_standby))
    .map((p) => ({
      id: p.profiles?.id ?? p.id,
      name: p.profiles?.full_name ?? p.guest_name ?? null,
      avatarPath: p.profiles?.avatar_url ?? null,
    }));
  // Only non-scheduled statuses get a badge: "Scheduled" said nothing (UX-JEVT-01).
  const statusBadge = eventStatusKey(status, e.starts_at);
  const subtitle = eventSubtitle(e.starts_at, place?.name, lang);

  // --- Actions ---
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setCtaError(null);
    try {
      await fn();
    } catch (err) {
      setCtaError(t(err instanceof Error ? err.message : 'unknown_error', { defaultValue: t('unknown_error') }));
    } finally {
      setBusy(false);
    }
  };
  const groupId = e.group_id;
  const onJoin = () =>
    run(async () => {
      const r = await joinEvent.mutateAsync({ eventId: id, groupId });
      // A Join the server queued (full, or others waiting) says so rather than nothing.
      if (r === 'confirmed') setJoinedOpen(true);
      else if (r === 'waiting_list') toast(t('joinedWaitlistToast'));
    });
  // A team invitation is answered by setting a team (B9): the chosen path does the confirming.
  const onAccept = () => {
    if (isTeam) {
      setTeamOpen(true);
      return;
    }
    void run(async () => {
      const r = await acceptInvite.mutateAsync({ eventId: id, groupId });
      if (r === 'confirmed') setJoinedOpen(true);
      else if (r === 'waiting_list') toast(t('joinedWaitlistToast'));
    });
  };
  const onTeamChoice = (c: TeamChoice) =>
    router.push(`/app/event/${id}/${c === 'have' ? 'have-partner' : 'need-partner'}`);
  // UX-JEVT-13. Leave cancels every request the player sent (leave_event, 0111/0112).
  const onEditChoice = (c: EditChoice) => {
    if (c !== 'leave') return onTeamChoice(c);
    // The organizer never gets here past the deadline (the row is hidden — canLeave), but never
    // send them to contact themselves either way.
    if (leaveLocked && isOrganizer) return toast(t('leave_deadline_passed'), 'error');
    if (leaveLocked) return setDialog('leaveLocked');
    setLeaveInterestedOpen(true);
  };
  const onDecline = () => run(() => declineInvite.mutateAsync());
  // A waiting PAIR leaves together (leave_waiting_list drops the partner, 0112): confirm first.
  const leaveWaitlistNow = () => run(() => leaveWaitlist.mutateAsync());
  const onLeaveWaitlist = () => {
    if (me?.pair_participant_id != null) return setLeavePairWaitlistOpen(true);
    void leaveWaitlistNow();
  };
  // spot_taken (someone confirmed first), gender_full (mixed: the free spot is in the other half),
  // not_on_waiting_list and event_closed come back as the error line via `run`. On a claim,
  // use_team_join means the viewer's waiting partner is gone (only a pair claims a team spot), so
  // say that rather than the generic "join via your team".
  const onClaim = () =>
    run(async () => {
      try {
        await claimSpot.mutateAsync();
      } catch (err) {
        throw err instanceof Error && err.message === 'use_team_join' ? new Error('claimPartnerLeft') : err;
      }
      setJoinedOpen(true);
    });
  const onLeave = async () => {
    setBusy(true);
    try {
      await leaveEvent.mutateAsync({ eventId: id, groupId });
      setDialog(null);
      setLeaveInterestedOpen(false);
      toast(t('leftToast'));
    } catch (err) {
      toast(t(err instanceof Error ? err.message : 'unknown_error', { defaultValue: t('unknown_error') }), 'error');
    } finally {
      setBusy(false);
    }
  };
  const onShare = async () => {
    try {
      if ((await shareEvent(id, e.name)) === 'copied') toast(t('linkCopied'));
    } catch {
      toast(t('copyFailed'), 'error');
    }
  };
  const onCalendar = () => {
    try {
      downloadEventIcs({
        id,
        name: e.name,
        starts_at: e.starts_at,
        duration_minutes: e.duration_minutes,
        description: e.description,
        place,
      });
    } catch {
      toast(t('calendarError'), 'error');
    }
  };
  // A 1:1 conversation with the organizer, created on demand (as the web "New message" page does).
  const onChatOrganizer = async () => {
    if (!uid || !organizer) return;
    setBusy(true);
    try {
      const cid = await openDirectChannel(uid, organizer.id);
      setDialog(null);
      router.push(`/app/chat/${encodeURIComponent(cid)}`);
    } catch {
      toast(tc('chatUnavailable'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const openEventChat = async () => {
    try {
      const { cid } = await ensureChannel.mutateAsync({ kind: 'event', id });
      router.push(`/app/chat/${encodeURIComponent(cid)}`);
    } catch {
      toast(tc('chatUnavailable'), 'error');
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-3xl flex-col gap-4 px-4 pt-3 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <BackButton fallbackHref="/app/events" label={t('back')} />
        <div className="flex items-center gap-1">
          {isOrganizer ? (
            <Button asChild variant="tertiary" size="icon">
              <Link href={`/app/event/${id}/manage`} aria-label={t('manageEventTitle')} data-testid="event-settings">
                <Settings />
              </Link>
            </Button>
          ) : null}
          {/* The organizer who only organizes has nothing to leave; Share and Add to calendar are
              on Manage Event for them. */}
          {!isOrganizer || me != null ? (
            <EventMenu
              canLeave={leaveOffered}
              teamLeave={isTeam && me?.status === 'confirmed'}
              leaveLocked={leaveLocked}
              organizer={organizer}
              busy={busy}
              dialog={dialog}
              setDialog={setDialog}
              onShare={() => void onShare()}
              onCalendar={onCalendar}
              onLeave={onLeave}
              onChatOrganizer={() => void onChatOrganizer()}
            />
          ) : null}
        </div>
      </div>

      {isOrganizer ? (
        <div className="flex items-center gap-3" data-testid="event-organizer-status">
          <p className="flex-1 font-medium">{organizerGoing ? t('organizerPlayingBadge') : t('organizerBadge')}</p>
          {organizerCanJoin ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={isTeam ? () => setTeamOpen(true) : () => void onJoin()}
              data-testid="event-join-as-player"
            >
              {t('joinAsPlayerCta')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {/* The organizer's status line already says "going". */}
      {bannerKind && !(isOrganizer && bannerKind === 'going') ? <StateBanner state={bannerKind} /> : null}

      <EventThumb path={e.thumbnail_path} shape="hero" />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{e.name}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
        {statusBadge !== 'statusScheduled' || recurring ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {statusBadge !== 'statusScheduled' ? <Badge variant="secondary">{t(statusBadge)}</Badge> : null}
            {recurring ? <Badge variant="outline">{t('recurrentTag')}</Badge> : null}
          </div>
        ) : null}
      </div>

      <PlayersCard
        people={confirmedPeople}
        confirmed={ps.totalIn}
        capacity={ps.totalCapacity}
        href={`/app/event/${id}/players`}
      />

      {isOrganizer ? (
        <>
          <PlayersCard
            title={t('managePlayersTitle')}
            people={confirmedPeople}
            confirmed={ps.totalIn}
            capacity={ps.totalCapacity}
            href={`/app/event/${id}/manage/players`}
            testId="event-manage-players"
          />
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" data-testid="event-organizer-chips">
            {e.entrance_fee_enabled ? (
              <Button asChild variant="secondary" size="sm" className="shrink-0 rounded-full">
                <Link href={`/app/event/${id}/manage/payments`} data-testid="event-chip-payments">
                  {t('paymentListTitle')}
                </Link>
              </Button>
            ) : null}
            {/* Every event, group-less ones included (decision 6, 0124). */}
            <Button asChild variant="secondary" size="sm" className="shrink-0 rounded-full">
              <Link href={`/app/event/${id}/manage/blast`} data-testid="event-chip-blast">
                {t('sendBlastCta')}
              </Link>
            </Button>
            {status === 'scheduled' ? (
              <Button asChild variant="secondary" size="sm" className="shrink-0 rounded-full">
                <Link href={`/app/event/${id}/manage?sheet=preferences`} data-testid="event-chip-preferences">
                  {t('step8Title')}
                </Link>
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap gap-2" data-testid="event-badges">
        {badges.map((b) => (
          <Badge key={b} variant="secondary">
            {b}
          </Badge>
        ))}
      </div>

      {e.description ? <p className="whitespace-pre-line text-sm">{e.description}</p> : null}

      <InfoWidgets
        items={[
          { label: t('widgetCourts'), value: String(e.num_courts) },
          { label: t('widgetScoring'), value: scoringText },
          { label: t('widgetFee'), value: feeText },
        ]}
      />

      {organizer ? (
        <PersonCard
          person={organizer}
          caption={t('organizerLabel')}
          href={`/app/profile/${organizer.id}`}
          testId="event-organizer-card"
        />
      ) : null}

      {place ? <LocationCard place={place} /> : null}

      {/* Only private and group-less events have their own chat (mobile's hasOwnChat); a public
          group event talks in the group's channel. */}
      {(me != null || isOrganizer) && (e.is_private || e.group_id == null) ? (
        <Button variant="secondary" disabled={ensureChannel.isPending} onClick={() => void openEventChat()}>
          {tc('openChat')}
        </Button>
      ) : null}

      {status === 'completed' ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('resultTitle')}</h2>
          {result.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <EventResultTable rows={(result.data ?? []) as EventResultRow[]} />
          )}
        </section>
      ) : null}

      <div className="pb-4" />

      <EventCTA
        bottom={bottom}
        eventId={id}
        startHere={startHere}
        organizerWaiting={status === 'scheduled' && me?.status === 'waiting_list'}
        organizerCanClaim={claimable}
        organizerInterested={status === 'scheduled' && me?.status === 'interested' && !joinClosed}
        scheduled={status === 'scheduled'}
        countdownMs={joinCutoffMs - nowMs}
        teamCountdown={showJoinCountdown(joinCutoffMs, nowMs)}
        inviter={myInvite?.inviter ?? null}
        busy={busy}
        error={ctaError}
        onJoin={() => void onJoin()}
        onLeaveWaitlist={onLeaveWaitlist}
        onClaim={() => void onClaim()}
        onAccept={() => void onAccept()}
        onDecline={() => void onDecline()}
        onTeamJoin={() => setTeamOpen(true)}
        onEditResponse={() => setEditOpen(true)}
        onStart={startFlow.onStart}
        startPending={startFlow.pending}
        pinned={pending.length > 0 ? <PendingActionsCard actions={pending} /> : undefined}
      />
      {startFlow.dialog}

      <TeamEventDialog open={teamOpen} onClose={() => setTeamOpen(false)} onChoose={onTeamChoice} />
      <EditResponseDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onChoose={onEditChoice}
        canLeave={leaveOffered}
      />
      <GroupConfirm
        open={leaveInterestedOpen}
        onClose={() => setLeaveInterestedOpen(false)}
        title={t('leaveConfirmTitle')}
        body={t('leaveInterestedBody')}
        confirmLabel={t('leaveConfirmCta')}
        cancelLabel={t('cancel')}
        destructive
        busy={busy}
        onConfirm={onLeave}
      />
      <GroupConfirm
        open={leavePairWaitlistOpen}
        onClose={() => setLeavePairWaitlistOpen(false)}
        title={t('leaveWaitlistCta')}
        body={t('leaveTeamConfirmBody')}
        confirmLabel={t('leaveWaitlistCta')}
        cancelLabel={t('cancel')}
        destructive
        busy={busy}
        onConfirm={() => {
          setLeavePairWaitlistOpen(false);
          void leaveWaitlistNow();
        }}
      />

      <JoinedDialog
        open={joinedOpen}
        onClose={() => setJoinedOpen(false)}
        thumbnailPath={e.thumbnail_path}
        name={e.name}
        subtitle={subtitle}
        onCalendar={onCalendar}
      />
    </div>
  );
}
