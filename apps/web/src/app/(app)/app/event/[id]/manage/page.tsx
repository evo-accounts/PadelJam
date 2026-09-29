'use client';
/**
 * Manage Event (UX-MEVT-03) — an overview, reached from the settings icon on the event page (its
 * only entry point). Web's twin of mobile's `app/event/[id]/manage.tsx`. Every card opens a dialog
 * holding only that piece of information (`EventEditDialog`), never the creation steps as one form.
 *
 *   header    back · "Manage Event"; format, modality and group as read-only chips (UX-MEVT-09)
 *   cards     Event name → General Info · Preferences | Scoring · Confirmed | Paid (donuts — two
 *             lists that never merge) · Location → Location & Courts · Date → Date & Time ·
 *             Activity (full page) · Next occurrences (a recurring event, UX-MEVT-22)
 *   actions   Share, Add to calendar, Send blast, Export, Start event (any time — the start
 *             flow's check and dialogs, UX-MEVT-23)
 *   footer    Duplicate | Cancel
 *
 * Only a scheduled event is editable (update_event refuses anything else): the cards of an event in
 * progress are read-only. A completed event reduces to the Paid donut, the ranking toggle, Activity,
 * Export and Duplicate (decision 16). The Paid card is hidden when there is no fee.
 *
 * `?sheet=<kind>` opens one of the edit dialogs on arrival — the event page's Preferences chip
 * links here that way.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useEvent,
  useEventInvitations,
  useEventParticipants,
  useEventRealtime,
  useCommunityMembers,
  useEventSeries,
  useEventTeams,
  useGroup,
  useSetEventRanking,
  type EventDetail,
} from '@padel/api';
import { eventPlace, formatEventWhen, participationState } from '@padel/utils';
import { BackButton } from '@/components/group/GroupHeader';
import { CancelEventDialog } from '@/components/event/manage/CancelEventDialog';
import { DuplicateEventDialog } from '@/components/event/manage/DuplicateEventDialog';
import {
  EDIT_DIALOG_KINDS,
  EventEditDialog,
  type EditDialogKind,
} from '@/components/event/manage/EventEditDialog';
import { formatLabel, modalityLabel, preferencesSummary, scoringLabel } from '@/components/event/manage/eventLabels';
import { ExportDialog } from '@/components/event/manage/ExportDialog';
import { NextOccurrences } from '@/components/event/manage/NextOccurrences';
import { useStartFlow } from '@/components/event/manage/useStartFlow';
import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { useEventCourts } from '@/components/event/manage/useSaveEvent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Donut } from '@/components/ui/donut';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toaster';
import { downloadEventIcs, shareEvent } from '@/lib/eventLinks';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';

type Dialog = EditDialogKind | 'export' | 'duplicate' | 'cancel';

export default function ManageEventPage() {
  const { id } = useParams<{ id: string }>();
  const sheet = useSearchParams().get('sheet');
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);

  const header = (
    <div className="flex items-center gap-2">
      <BackButton fallbackHref={`/app/event/${id}`} label={t('back')} />
      <h1 className="text-xl font-semibold">{t('manageEventTitle')}</h1>
    </div>
  );

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (event.isError) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-3 sm:px-6">
        {header}
        <div className="flex flex-col items-center gap-3 p-8 text-center" role="alert" data-testid="manage-load-error">
          <p className="text-sm text-muted-foreground">{t('loadError')}</p>
          <Button variant="secondary" onClick={() => void event.refetch()}>
            {t('retryCta')}
          </Button>
        </div>
      </div>
    );
  }
  // Organizer only: no event (RLS) or someone else's.
  if (event.data == null || uid == null || uid !== event.data.organizer_id) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-3 sm:px-6">
        {header}
        <p className="p-8 text-center text-sm text-muted-foreground" data-testid="manage-forbidden">
          {t('forbidden')}
        </p>
      </div>
    );
  }

  const initial = EDIT_DIALOG_KINDS.includes(sheet as EditDialogKind) ? (sheet as EditDialogKind) : null;
  return <Dashboard key={event.data.id} event={event.data} header={header} initialDialog={initial} />;
}

function Dashboard({
  event,
  header,
  initialDialog,
}: {
  event: EventDetail;
  header: React.ReactNode;
  initialDialog: Dialog | null;
}) {
  const { t, i18n } = useT('event');
  const { t: tCommunity } = useT('community');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const nowMs = useNow();
  const id = event.id;
  const participants = useEventParticipants(id);
  const teams = useEventTeams(id);
  const invitations = useEventInvitations(id);
  const series = useEventSeries(id);
  const courtIds = useEventCourts(id);
  const setRanking = useSetEventRanking(id);
  const [dialog, setDialog] = useState<Dialog | null>(initialDialog);
  const startFlow = useStartFlow(id, event);
  // Turning Repeat every week on can hit the community's recurring-events cap (UpgradePrompt).
  // Only an admin can change the plan; the member list is read only once the prompt is up.
  const [capPrompt, setCapPrompt] = useState(false);
  const group = useGroup(event.group_id);
  const communityMembers = useCommunityMembers(capPrompt ? group.data?.community_id : undefined);
  const canManagePlan = communityMembers.data?.find((m) => m.user_id === uid)?.role === 'admin';

  const parts = participants.data ?? [];
  const completeTeams = (teams.data ?? []).filter((tm) => tm.player_a != null && tm.player_b != null).length;
  const recurring = event.series_id != null && series.data != null && series.data.is_active;
  const status = event.status;
  const editable = status === 'scheduled';
  const completed = status === 'completed';
  const hasFee = event.entrance_fee_enabled;
  const ps = participationState(event, parts, invitations.data ?? [], event.organizer_id, nowMs);
  const confirmed = parts.filter((p) => p.status === 'confirmed');
  const confirmedMain = confirmed.filter((p) => !p.is_standby).length;
  const paid = confirmed.filter((p) => p.has_paid).length;
  const anyonePaid = parts.some((p) => p.has_paid);
  const place = eventPlace(event);
  const isPublicGroup = event.group_id != null && !event.is_private;

  const close = () => {
    setDialog(null);
    // Drop `?sheet=` so a reload does not open the dialog again.
    if (initialDialog) router.replace(`/app/event/${id}/manage`);
  };
  const edit = (k: EditDialogKind) => (editable ? () => setDialog(k) : undefined);

  const onShare = async () => {
    try {
      if ((await shareEvent(id, event.name)) === 'copied') toast(t('linkCopied'));
    } catch {
      toast(t('copyFailed'), 'error');
    }
  };
  const onCalendar = () => {
    try {
      downloadEventIcs({
        id,
        name: event.name,
        starts_at: event.starts_at,
        duration_minutes: event.duration_minutes,
        description: event.description,
        place,
      });
    } catch {
      toast(t('calendarError'), 'error');
    }
  };
  const onToggleRanking = (on: boolean) =>
    void setRanking
      .mutateAsync(on)
      .catch((e: unknown) =>
        toast(t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') }), 'error'),
      );

  const confirmedCard = (
    <DashCard
      title={t('dashConfirmedTitle')}
      a11yValue={t('dashRatio', { n: ps.totalIn, total: ps.totalCapacity })}
      // UX-MEVT-26: a team event adds how many pairs are complete under the count.
      detail={event.specification === 'team' ? t('dashTeamsComplete', { count: completeTeams }) : undefined}
      href={`/app/event/${id}/manage/players`}
      testId="manage-confirmed"
    >
      <Donut value={ps.totalIn} total={ps.totalCapacity} label={t('dashConfirmedTitle')} decorative />
    </DashCard>
  );
  const paidCard = hasFee ? (
    <DashCard
      title={t('dashPaidTitle')}
      a11yValue={t('dashRatio', { n: paid, total: confirmed.length })}
      href={`/app/event/${id}/manage/payments`}
      testId="manage-paid"
    >
      <Donut value={paid} total={confirmed.length} label={t('dashPaidTitle')} decorative />
    </DashCard>
  ) : null;
  const activityCard = (
    <DashCard title={t('activityLogCta')} href={`/app/event/${id}/manage/activity`} testId="manage-activity" />
  );
  const exportAction = (
    <Button variant="secondary" className="w-full" onClick={() => setDialog('export')} data-testid="manage-export">
      {t('exportDataCta')}
    </Button>
  );
  const duplicateAction = (
    <Button variant="secondary" className="flex-1" onClick={() => setDialog('duplicate')} data-testid="manage-duplicate">
      {t('duplicateCta')}
    </Button>
  );

  const chips = [
    formatLabel(t, event),
    event.specification === 'team' ? t('teamFormatBadge') : modalityLabel(t, event),
    event.group?.name ?? (event.group_id == null ? t('groupBadgeNone') : null),
  ].filter((c): c is string => c != null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-3 pb-8 sm:px-6">
      {header}
      <div className="flex flex-wrap gap-2" data-testid="manage-chips">
        {chips.map((c) => (
          <Badge key={c} variant="secondary">
            {c}
          </Badge>
        ))}
      </div>

      {completed ? (
        <>
          {paidCard ? <div className="grid grid-cols-2 gap-3">{paidCard}</div> : null}
          {isPublicGroup ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <Label htmlFor="manage-ranking">{t('rankingToggleLabel')}</Label>
              <Switch
                id="manage-ranking"
                checked={event.counts_for_ranking}
                disabled={setRanking.isPending}
                onCheckedChange={onToggleRanking}
                data-testid="manage-ranking"
              />
            </div>
          ) : null}
          {activityCard}
          <div className="mt-2 flex flex-col gap-2">
            {exportAction}
            <div className="flex gap-3">{duplicateAction}</div>
          </div>
        </>
      ) : (
        <>
          <DashCard title={t('dashNameTitle')} value={event.name} onClick={edit('general')} testId="manage-name" />
          <div className="grid grid-cols-2 gap-3">
            <DashCard
              title={t('step8Title')}
              value={preferencesSummary(t, event)}
              onClick={edit('preferences')}
              testId="manage-preferences"
            />
            <DashCard
              title={t('widgetScoring')}
              value={scoringLabel(t, event)}
              onClick={edit('scoring')}
              testId="manage-scoring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {confirmedCard}
            {paidCard}
          </div>
          <DashCard
            title={t('locationCardTitle')}
            value={place?.name ?? t('noLocationValue')}
            detail={t('dashCourts', { count: event.num_courts })}
            onClick={edit('location')}
            testId="manage-location"
          />
          <DashCard
            title={t('dateLabel')}
            value={formatEventWhen(new Date(event.starts_at), event.duration_minutes, i18n.language)}
            onClick={edit('date')}
            testId="manage-date"
          />
          {activityCard}
          {recurring ? <NextOccurrences eventId={id} /> : null}

          <div className="mt-2 flex flex-col gap-2">
            <Button variant="secondary" className="w-full" onClick={() => void onShare()} data-testid="manage-share">
              {t('shareAction')}
            </Button>
            <Button variant="secondary" className="w-full" onClick={onCalendar} data-testid="manage-calendar">
              {t('addToCalendarAction')}
            </Button>
            {/* Every event, group-less ones included (decision 6, 0124). */}
            <Button asChild variant="secondary" className="w-full">
              <Link href={`/app/event/${id}/manage/blast`} data-testid="manage-blast">
                {t('sendBlastCta')}
              </Link>
            </Button>
            {exportAction}
            {/* The organizer can start any time from here, ahead of schedule (UX-MEVT-23). */}
            {editable ? (
              <Button
                className="w-full"
                disabled={startFlow.pending}
                aria-busy={startFlow.pending || undefined}
                onClick={startFlow.onStart}
                data-testid="manage-start"
              >
                {t('startCta')}
              </Button>
            ) : null}
          </div>

          <div className="flex gap-3">
            {duplicateAction}
            {editable ? (
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setDialog('cancel')}
                data-testid="manage-cancel"
              >
                {t('cancelEventCta')}
              </Button>
            ) : null}
          </div>
        </>
      )}

      {dialog != null && (EDIT_DIALOG_KINDS as readonly string[]).includes(dialog) && editable ? (
        <EventEditDialog
          kind={dialog as EditDialogKind}
          event={event}
          confirmedMain={confirmedMain}
          recurring={recurring}
          courtIds={courtIds.data}
          onClose={close}
          onSaved={() => {
            close();
            toast(t('eventSavedToast'));
          }}
          onUpgrade={() => {
            close();
            setCapPrompt(true);
          }}
        />
      ) : null}
      <UpgradePrompt
        open={capPrompt}
        onClose={() => setCapPrompt(false)}
        title={tCommunity('upgradeRecurringCap')}
        canManage={canManagePlan}
      />
      {startFlow.dialog}
      {dialog === 'export' ? (
        <ExportDialog
          event={event}
          onClose={close}
          onDone={(message) => {
            close();
            toast(message);
          }}
        />
      ) : null}
      {dialog === 'duplicate' ? (
        <DuplicateEventDialog
          event={event}
          courtIds={courtIds.data}
          onClose={close}
          onDuplicated={(newId) => {
            setDialog(null);
            toast(t('duplicatedToast'));
            router.push(`/app/event/${newId}`);
          }}
        />
      ) : null}
      {dialog === 'cancel' ? (
        <CancelEventDialog
          event={event}
          recurring={recurring}
          anyonePaid={anyonePaid}
          onClose={close}
          onCancelled={() => {
            setDialog(null);
            toast(t('cancelledToast'));
            router.push(`/app/event/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * One dashboard card: its title, the current value as a subtitle, and a chevron when it opens
 * something (a dialog via `onClick`, a page via `href`). A card that opens something is ONE control
 * whose name carries the value, so a donut inside it is decorative.
 */
function DashCard({
  title,
  value,
  detail,
  a11yValue,
  onClick,
  href,
  children,
  testId,
}: {
  title: string;
  value?: string;
  detail?: string;
  /** What a screen reader hears after the title when the value is drawn (a donut). */
  a11yValue?: string;
  onClick?: () => void;
  href?: string;
  children?: React.ReactNode;
  testId: string;
}) {
  const interactive = onClick != null || href != null;
  const label = interactive ? [title, value, detail, a11yValue].filter(Boolean).join(', ') : undefined;
  const body = (
    <>
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{title}</span>
        {interactive ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      </span>
      {value ? <span className="line-clamp-2 font-medium break-words">{value}</span> : null}
      {detail ? <span className="text-sm text-muted-foreground">{detail}</span> : null}
      {children ? <span className="flex justify-center pt-2">{children}</span> : null}
    </>
  );
  const cls = cn(
    'flex w-full min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 text-left',
    interactive && 'transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
  );
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={label} data-testid={testId}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-label={label} data-testid={testId}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}
