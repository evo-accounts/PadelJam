'use client';
/**
 * An Upcoming occurrence of a recurring event (UX-MEVT-22, decision 5), opened from Manage Event's
 * "Next occurrences". Web's twin of mobile's `app/event/[id]/occurrence.tsx`. `[id]` is the event
 * whose Manage page listed it; `?slot=` the Lisbon date of the weekly slot
 * (`event_next_occurrences.slot_date`). The occurrence does not exist as an event yet, so the page
 * is the standard event look with what it will carry — name, date, time, location, description and
 * the read-only widgets — and nothing tied to participation: no players, confirmations, teams or
 * matches.
 *
 * The header's settings icon does not open the dashboard: it opens a menu with
 *   Edit date & time          the Date & Time dialog scoped to this occurrence (no Repeat card, no
 *                             duration) → update_occurrence_slot
 *   Send invitation now       confirmation → send_occurrence_now; it becomes Scheduled
 *   Cancel this occurrence    confirmation → cancel_occurrence_slot; the series goes on
 */
import { useCallback, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Settings } from 'lucide-react';
import { useT } from '@padel/i18n';
import {
  useCancelOccurrenceSlot,
  useEvent,
  useEventNextOccurrences,
  useSendOccurrenceNow,
  useUpdateOccurrenceSlot,
  type EventDetail,
  type EventOccurrence,
} from '@padel/api';
import { eventSubtitle, InfoWidgets, LocationCard } from '@/components/event/EventDetailParts';
import { EventThumb } from '@/components/event/EventThumb';
import { draftFromEvent, type ManageDraft } from '@/components/event/manage/eventDraft';
import { ManageDialog } from '@/components/event/manage/ManageDialog';
import { occurrencePlace } from '@/components/event/manage/NextOccurrences';
import { dateErrors } from '@/components/event/wizard/draft-logic';
import { DateSummaryFooter, Step7Schedule } from '@/components/event/wizard/steps/Step7Schedule';
import type { WebWizardDraft } from '@/components/event/wizard/types';
import { GroupConfirm } from '@/components/group/GroupConfirm';
import { BackButton } from '@/components/group/GroupHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { useNow } from '@/lib/useNow';

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

export default function OccurrencePage() {
  const { id } = useParams<{ id: string }>();
  const slot = useSearchParams().get('slot');
  const { t } = useT('event');
  const event = useEvent(id);
  const occurrences = useEventNextOccurrences(id);

  const header = <BackButton fallbackHref={`/app/event/${id}/manage`} label={t('back')} />;

  if (event.isLoading || occurrences.isLoading) return <Skeleton className="m-6 h-40" />;
  if (event.isError || occurrences.isError) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-3 sm:px-6">
        {header}
        <div className="flex flex-col items-center gap-3 p-8 text-center" role="alert" data-testid="occurrence-load-error">
          <p className="text-sm text-muted-foreground">{t('loadError')}</p>
          <Button variant="secondary" onClick={() => void Promise.all([event.refetch(), occurrences.refetch()])}>
            {t('retryCta')}
          </Button>
        </div>
      </div>
    );
  }
  // Organizer only (event_next_occurrences answers nobody else), and only while still Upcoming:
  // sent or cancelled, it has left this list.
  const occurrence = occurrences.data?.find((o) => o.slot_date === slot && o.status === 'upcoming');
  if (event.data == null || event.data.series_id == null || occurrence == null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-3 sm:px-6">
        {header}
        <p className="p-8 text-center text-sm text-muted-foreground" data-testid="occurrence-gone">
          {t('occurrence_not_found')}
        </p>
      </div>
    );
  }
  return (
    <Occurrence
      key={occurrence.slot_date}
      event={event.data}
      seriesId={event.data.series_id}
      occurrence={occurrence}
      header={header}
    />
  );
}

type Confirm = 'send' | 'cancel' | null;

function Occurrence({
  event,
  seriesId,
  occurrence,
  header,
}: {
  event: EventDetail;
  seriesId: string;
  occurrence: EventOccurrence;
  header: React.ReactNode;
}) {
  const { t, i18n } = useT('event');
  const router = useRouter();
  const sendNow = useSendOccurrenceNow(event.id);
  const cancelSlot = useCancelOccurrenceSlot(event.id);
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const slotArgs = { seriesId, slotDate: occurrence.slot_date };
  const busy = sendNow.isPending || cancelSlot.isPending;

  const placeName = occurrencePlace(occurrence);
  const place = placeName
    ? {
        name: placeName,
        address:
          occurrence.location_address && occurrence.location_address !== placeName ? occurrence.location_address : null,
      }
    : null;

  const scoringLabel = t(`scoring${cap(event.scoring_mode)}Label`);
  const feeText = event.entrance_fee_enabled
    ? event.entrance_fee_method != null
      ? `${event.entrance_fee_amount ?? 0} · ${t(`fee${cap(event.entrance_fee_method)}Label`)}`
      : `${event.entrance_fee_amount ?? 0}`
    : t('feeFree');

  // Replace, not push: once sent or cancelled the preview is gone, so Back must not return to it.
  const backToManage = () => router.replace(`/app/event/${event.id}/manage`);
  const fail = (e: unknown) =>
    toast(t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') }), 'error');
  const onConfirm = async () => {
    try {
      if (confirm === 'send') {
        await sendNow.mutateAsync(slotArgs);
        toast(t('occurrenceSentToast'));
      } else if (confirm === 'cancel') {
        await cancelSlot.mutateAsync(slotArgs);
        toast(t('occurrenceCancelledToast'));
      }
      setConfirm(null);
      backToManage();
    } catch (e) {
      setConfirm(null);
      fail(e);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-3 pb-8 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        {header}
        {/* Non-modal so the dialogs a row opens are not fighting the menu for focus and pointer. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="tertiary"
              size="icon"
              aria-label={t('occurrenceSettingsTitle')}
              disabled={busy}
              data-testid="occurrence-settings"
            >
              <Settings />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuItem onSelect={() => setEditOpen(true)} data-testid="occurrence-menu-edit">
              {t('occurrenceEditDate')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setConfirm('send')} data-testid="occurrence-menu-send">
              {t('occurrenceSendNow')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirm('cancel')}
              data-testid="occurrence-menu-cancel"
            >
              {t('occurrenceCancel')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EventThumb path={event.thumbnail_path} shape="hero" />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{occurrence.name ?? event.name}</h1>
        <p className="text-muted-foreground" data-testid="occurrence-when">
          {eventSubtitle(occurrence.starts_at, placeName, i18n.language)}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant="secondary">{t('occurrenceUpcoming')}</Badge>
          <Badge variant="outline">{t('recurrentTag')}</Badge>
        </div>
      </div>

      {event.description ? <p className="whitespace-pre-line text-sm">{event.description}</p> : null}

      <InfoWidgets
        items={[
          { label: t('widgetCourts'), value: String(event.num_courts) },
          {
            label: t('widgetScoring'),
            value: event.scoring_mode === 'classic' ? scoringLabel : `${scoringLabel} · ${event.scoring_value}`,
          },
          { label: t('widgetFee'), value: feeText },
        ]}
      />

      {place ? <LocationCard place={place} /> : null}

      {editOpen ? (
        <OccurrenceDateDialog
          event={event}
          seriesId={seriesId}
          occurrence={occurrence}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            toast(t('eventSavedToast'));
          }}
        />
      ) : null}
      <GroupConfirm
        open={confirm === 'send'}
        onClose={() => setConfirm(null)}
        title={t('occurrenceSendNowTitle')}
        body={t('occurrenceSendNowBody')}
        confirmLabel={t('occurrenceSendNowConfirm')}
        cancelLabel={t('cancel')}
        busy={busy}
        onConfirm={onConfirm}
      />
      <GroupConfirm
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        title={t('occurrenceCancelTitle')}
        body={t('occurrenceCancelBody')}
        confirmLabel={t('occurrenceCancelConfirm')}
        cancelLabel={t('cancel')}
        destructive
        busy={busy}
        onConfirm={onConfirm}
      />
    </div>
  );
}

/** Edit Date & Time for one Upcoming occurrence: its start only (update_occurrence_slot). */
function OccurrenceDateDialog({
  event,
  seriesId,
  occurrence,
  onClose,
  onSaved,
}: {
  event: EventDetail;
  seriesId: string;
  occurrence: EventOccurrence;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT('event');
  const update = useUpdateOccurrenceSlot(event.id);
  const nowMs = useNow(60_000);
  const [draft, setDraft] = useState<ManageDraft>(() => ({
    ...draftFromEvent(event),
    // One occurrence of a series: never a new series of its own.
    series: undefined,
    startsAt: new Date(occurrence.starts_at).toISOString(),
    durationMinutes: occurrence.duration_minutes,
  }));
  const patch = useCallback((p: Partial<WebWizardDraft>) => setDraft((prev) => ({ ...prev, ...p })), []);
  const [flagged, setFlagged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSave = async () => {
    if (dateErrors(draft, nowMs).includes('startsAt') || !draft.startsAt) {
      setFlagged(true);
      setMessage(t('startTimeError'));
      return;
    }
    setMessage(null);
    try {
      await update.mutateAsync({ seriesId, slotDate: occurrence.slot_date, startsAt: draft.startsAt });
      onSaved();
    } catch (e) {
      setMessage(t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') }));
    }
  };

  const stepProps = { draft, patch, communityId: '', flagged, nowMs };
  return (
    <ManageDialog
      title={t('editDateTimeTitle')}
      onClose={onClose}
      primaryLabel={t('sheetSave')}
      onPrimary={() => void onSave()}
      busy={update.isPending}
      error={message}
      testId="sheet-occurrence-date"
    >
      <Step7Schedule {...stepProps} context="occurrence" />
      <DateSummaryFooter {...stepProps} />
    </ManageDialog>
  );
}
