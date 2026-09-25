'use client';
/**
 * The event page (UX-JEVT-02..07), web's twin of mobile's `app/event/[id]/index.tsx`. One body for
 * every viewer; only the top banner and the bottom area change with the viewer's state — decided
 * by `bottomState` / `bannerState` / `canLeave` in `@padel/utils`, the table mobile reads too.
 *
 *   header   back · ⋯ (Share, Add to calendar, Leave event)
 *   banner   You are going / stand-by / waiting list
 *   body     image, name + date · time · place, Players card, type + group badges, description,
 *            Courts / Scoring / Fee, Organizer card, Location card
 *   bottom   invited · join (+ countdown) · full · waiting list · closed · organizer actions
 */
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  bannerState,
  bottomState,
  canLeave,
  eventPlace,
  participationState,
  showJoinCountdown,
} from '@padel/utils';
import {
  eventStatusKey,
  useAcceptEventInvitation,
  useDeclineEventInvitation,
  useEnsureChannel,
  useEvent,
  useEventInvitations,
  useEventParticipants,
  useEventRealtime,
  useEventResultSummary,
  useJoinEvent,
  useLeaveEvent,
  useLeaveWaitingList,
} from '@padel/api';
import { EventCTA } from '@/components/event/EventCTA';
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
import { BackButton } from '@/components/group/GroupHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { downloadEventIcs, shareEvent } from '@/lib/eventLinks';
import { streamClient } from '@/lib/streamClient';
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

  const joinEvent = useJoinEvent();
  const leaveEvent = useLeaveEvent();
  const leaveWaitlist = useLeaveWaitingList(id);
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

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data) return <EventNoAccess />;

  const e = event.data;
  const parts = participants.data ?? [];
  const ps = participationState(e, parts, invitations.data ?? [], uid, nowMs);
  const { me, myInvite, isOrganizer, joinClosed, leaveLocked, joinCutoffMs } = ps;
  const status = e.status;
  const lang = i18n.language;
  const place = eventPlace(e);
  const organizer = e.organizer;

  const bottom = bottomState({
    status,
    specification: e.specification,
    isOrganizer,
    me,
    hasInvite: myInvite != null,
    joinClosed,
    full: ps.totalIn >= ps.totalCapacity,
    countdown: showJoinCountdown(joinCutoffMs, nowMs),
  });
  const bannerKind = bannerState(status, me);
  const leaveOffered = canLeave(status, me, isOrganizer, leaveLocked);

  // --- Body values ---
  const scoringLabel = t(`scoring${cap(e.scoring_mode)}Label`);
  const scoringText = e.scoring_mode === 'classic' ? scoringLabel : `${scoringLabel} · ${e.scoring_value}`;
  const feeText = e.entrance_fee_enabled
    ? e.entrance_fee_method != null
      ? `${e.entrance_fee_amount ?? 0} · ${t(`fee${cap(e.entrance_fee_method)}Label`)}`
      : `${e.entrance_fee_amount ?? 0}`
    : t('feeFree');
  const badges = [
    `${t(`type${cap(e.event_type)}Label`)} · ${t(`spec${cap(e.specification)}Label`)}`,
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
      if (r === 'confirmed') setJoinedOpen(true);
    });
  const onAccept = () =>
    run(async () => {
      const r = await acceptInvite.mutateAsync({ eventId: id, groupId });
      if (r === 'confirmed') setJoinedOpen(true);
    });
  const onDecline = () => run(() => declineInvite.mutateAsync());
  const onLeaveWaitlist = () => run(() => leaveWaitlist.mutateAsync());
  const onLeave = async () => {
    setBusy(true);
    try {
      await leaveEvent.mutateAsync({ eventId: id, groupId });
      setDialog(null);
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
      const ch = streamClient.channel('messaging', { members: [uid, organizer.id] });
      await ch.watch();
      setDialog(null);
      router.push(`/app/chat/${encodeURIComponent(ch.cid)}`);
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
        <EventMenu
          canLeave={leaveOffered}
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
      </div>

      {bannerKind ? <StateBanner state={bannerKind} /> : null}

      <EventThumb path={e.thumbnail_path} shape="hero" />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{e.name}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
        {statusBadge !== 'statusScheduled' || e.series_id ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {statusBadge !== 'statusScheduled' ? <Badge variant="secondary">{t(statusBadge)}</Badge> : null}
            {e.series_id ? <Badge variant="outline">{t('recurrentTag')}</Badge> : null}
          </div>
        ) : null}
      </div>

      <PlayersCard
        people={confirmedPeople}
        confirmed={ps.totalIn}
        capacity={ps.totalCapacity}
        href={`/app/event/${id}/players`}
      />

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

      {me != null || isOrganizer ? (
        <Button variant="outline" disabled={ensureChannel.isPending} onClick={() => void openEventChat()}>
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
        isTeam={e.specification === 'team'}
        organizerPlaying={me != null && me.status !== 'waiting_list'}
        organizerWaiting={status === 'scheduled' && me?.status === 'waiting_list'}
        canJoinAsPlayer={status === 'scheduled' && me == null && !joinClosed}
        scheduled={status === 'scheduled'}
        countdownMs={joinCutoffMs - nowMs}
        inviter={myInvite?.inviter ?? null}
        busy={busy}
        error={ctaError}
        onJoin={() => void onJoin()}
        onLeaveWaitlist={() => void onLeaveWaitlist()}
        onAccept={() => void onAccept()}
        onDecline={() => void onDecline()}
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
