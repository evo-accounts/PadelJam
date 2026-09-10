'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { participationState } from '@padel/utils';
import {
  eventStatusKey,
  useEvent,
  useEventParticipants,
  useEventTeams,
  useEventResultSummary,
  useEventRealtime,
  useEventInvitations,
  useJoinEvent,
  useLeaveEvent,
  useLeaveWaitingList,
  useAcceptEventInvitation,
  useDeclineEventInvitation,
  useEnsureChannel,
} from '@padel/api';
import { EventCTA } from '@/components/event/EventCTA';
import {
  EventParticipantsList,
  type EventParticipant,
  type EventTeam,
} from '@/components/event/EventParticipantsList';
import { EventResultTable, type EventResultRow } from '@/components/event/EventResultTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

const cap = (s: string | null | undefined) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useT('event');
  const { t: tc } = useT('chat');
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const teams = useEventTeams(id);
  const result = useEventResultSummary(id);
  const uid = useSession().session?.user.id;
  const invitations = useEventInvitations(id);
  const joinEvent = useJoinEvent();
  const leaveEvent = useLeaveEvent();
  const leaveWaitlist = useLeaveWaitingList(id);
  const acceptInvite = useAcceptEventInvitation();
  const declineInvite = useDeclineEventInvitation(id);
  const [nowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [ctaError, setCtaError] = useState<string | null>(null);
  const ensureChannel = useEnsureChannel();
  const router = useRouter();
  const [chatBusy, setChatBusy] = useState(false);
  const openChat = () => {
    setChatBusy(true);
    ensureChannel
      .mutateAsync({ kind: 'event', id })
      .then((r) => router.push(`/app/chat/${encodeURIComponent(r.cid)}`))
      .catch(() => setChatBusy(false));
  };

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data) return <div className="p-6">{t('notAvailable')}</div>;

  const e = event.data;
  const parts: EventParticipant[] = participants.data ?? [];
  const teamRows: EventTeam[] = teams.data ?? [];

  const state = participationState(
    e,
    (participants.data ?? []) as {
      user_id: string | null;
      status: string;
      is_standby: boolean;
      waiting_list_position: number | null;
    }[],
    (invitations.data ?? []) as { invitee_id: string | null; invited_by: string }[],
    uid,
    nowMs,
  );
  const inviterName =
    state.myInvite != null
      ? parts.find((p) => p.user_id === state.myInvite!.invited_by)?.profiles?.full_name ?? null
      : null;
  const groupId = e.group_id;
  const runCta = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setCtaError(null);
    fn()
      .catch((err) => setCtaError(t(err instanceof Error ? err.message : 'unknown_error')))
      .finally(() => setBusy(false));
  };

  const when = e.starts_at
    ? new Date(e.starts_at).toLocaleString(i18n.language, {
        dateStyle: 'full',
        timeStyle: 'short',
      })
    : null;
  const where =
    e.venue?.name ??
    (e.has_location ? e.manual_location_name : null) ??
    e.location_text ??
    t('locationTbd');
  const venueAddress = e.venue?.address ?? (e.has_location ? e.manual_location_address : null);
  const organizerName =
    parts.find((p) => p.user_id === e.organizer_id)?.profiles?.full_name ?? null;

  const formatText = e.event_type ? t(`type${cap(e.event_type)}Label`) : null;
  const scoringText = e.scoring_mode
    ? e.scoring_mode === 'classic' || e.scoring_value == null
      ? t(`scoring${cap(e.scoring_mode)}Label`)
      : `${t(`scoring${cap(e.scoring_mode)}Label`)} · ${e.scoring_value}`
    : null;
  const feeText = e.entrance_fee_enabled
    ? e.entrance_fee_method != null
      ? `${e.entrance_fee_amount ?? 0} · ${t(`fee${cap(e.entrance_fee_method)}Label`)}`
      : `${e.entrance_fee_amount ?? 0}`
    : t('feeFree');

  const details: { label: string; value: string }[] = [];
  if (formatText) details.push({ label: t('formatLabel'), value: formatText });
  if (scoringText) details.push({ label: t('scoringLabel'), value: scoringText });
  details.push({ label: t('feeLabel'), value: feeText });
  if (organizerName) details.push({ label: t('organizerLabel'), value: organizerName });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{e.name}</h1>
          <Badge variant="secondary">{t(eventStatusKey(e.status, e.starts_at))}</Badge>
          {e.series_id ? <Badge variant="outline">{t('recurrentTag')}</Badge> : null}
          {state.isOrganizer && e.status === 'scheduled' ? (
            <Button asChild variant="outline" size="sm" className="ml-auto">
              <Link href={`/app/event/${id}/edit`}>{t('editTitle')}</Link>
            </Button>
          ) : null}
          {state.me != null || state.isOrganizer ? (
            <Button
              variant="outline"
              size="sm"
              disabled={chatBusy}
              onClick={openChat}
              className={state.isOrganizer && e.status === 'scheduled' ? undefined : 'ml-auto'}
            >
              {tc('openChat')}
            </Button>
          ) : null}
        </div>
        {when ? <p className="text-sm text-muted-foreground">{when}</p> : null}
        <div className="text-sm text-muted-foreground">
          <p>{where}</p>
          {venueAddress ? <p>{venueAddress}</p> : null}
        </div>
        {e.description ? <p className="pt-2 text-sm">{e.description}</p> : null}
      </div>

      <EventCTA
        event={e}
        state={state}
        nowMs={nowMs}
        inviterName={inviterName}
        busy={busy}
        error={ctaError}
        onJoin={() => runCta(() => joinEvent.mutateAsync({ eventId: id, groupId }))}
        onLeave={() => runCta(() => leaveEvent.mutateAsync({ eventId: id, groupId }))}
        onLeaveWaitlist={() => runCta(() => leaveWaitlist.mutateAsync())}
        onAccept={() => runCta(() => acceptInvite.mutateAsync({ eventId: id, groupId }))}
        onDecline={() => runCta(() => declineInvite.mutateAsync())}
      />

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('detailsTitle')}</h2>
        <dl className="flex flex-col gap-2">
          {details.map((d) => (
            <div key={d.label} className="flex justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="text-right font-medium">{d.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('playersTitle')}</h2>
        {participants.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <EventParticipantsList participants={parts} teams={teamRows} />
        )}
      </section>

      {e.status === 'completed' ? (
        <>
          <Separator />
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('resultTitle')}</h2>
            {result.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <EventResultTable rows={(result.data ?? []) as EventResultRow[]} />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
