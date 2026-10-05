'use client';
/**
 * Duplicate event (UX-MEVT-20, decision 4). A read-only summary of what the copy inherits — group,
 * format, modality, scoring, preferences, fee — over what can be set: name, thumbnail, date, time,
 * and location & courts (the same event often moves to another court of the same club). Nothing
 * about people carries over: the new event starts empty.
 *
 * The date is required and picked here (B8: `duplicate_event` refuses a missing or past start). It
 * opens on the same slot a week after the original, or the next such week still ahead.
 *
 * Location and courts are sent (`duplicate_event` overrides, 0122) only when changed here; left
 * alone, the copy keeps the original's venue, courts and point.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useDuplicateEvent, type EventDetail } from '@padel/api';
import { atTime, defaultStart, formatEventWhen, nextWeekly, timeOf } from '@padel/utils';
import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { eventThumbnailUrl } from '@/lib/community-images';
import { uploadCommunityImage } from '@/lib/upload';
import { useNow } from '@/lib/useNow';
import { DayStrip } from '../wizard/DayStrip';
import { FieldError } from '../wizard/FieldError';
import { TimeSlotPicker } from '../wizard/TimeSlotPicker';
import type { WebWizardDraft } from '../wizard/types';
import { courtsOrLocationChanged, draftFromEvent, locationOverrides, type ManageDraft } from './eventDraft';
import { LocationBody } from './EventEditDialog';
import { feeLabel, formatLabel, modalityLabel, preferencesSummary, scoringLabel } from './eventLabels';
import { ManageDialog } from './ManageDialog';

/** The original's slot, a week on — repeated until it is ahead of `now` by the default lead. */
export function duplicateStart(originalIso: string, now: Date): Date {
  let d = nextWeekly(new Date(originalIso));
  for (let i = 0; i < 520 && d.getTime() <= now.getTime() + 60 * 60_000; i += 1) d = nextWeekly(d);
  return d.getTime() > now.getTime() ? d : defaultStart(now);
}

export function DuplicateEventDialog({
  event,
  courtIds,
  onClose,
  onDuplicated,
}: {
  event: EventDetail;
  courtIds?: string[];
  onClose: () => void;
  onDuplicated: (newId: string) => void;
}) {
  const { t, i18n } = useT('event');
  const { t: tc } = useT('common');
  const uid = useSession().session?.user.id;
  const duplicate = useDuplicateEvent();
  const nowMs = useNow(60_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const [y, m, d] = [now.getFullYear(), now.getMonth(), now.getDate()];
  const today = useMemo(() => new Date(y, m, d), [y, m, d]);

  const [name, setName] = useState(event.name);
  const [start, setStart] = useState<Date>(() => duplicateStart(event.starts_at, new Date()));
  const [thumb, setThumb] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => () => {
    if (thumb) URL.revokeObjectURL(thumb.url);
  }, [thumb]);
  // Location & courts, as the Edit Location & Courts dialog edits them.
  const [place, setPlace] = useState<ManageDraft>(() => draftFromEvent(event, courtIds));
  const patchPlace = useCallback((p: Partial<WebWizardDraft>) => setPlace((prev) => ({ ...prev, ...p })), []);
  const [flagged, setFlagged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickDay = (day: Date) => {
    const kept = atTime(day, timeOf(start));
    setStart(kept.getTime() > now.getTime() ? kept : defaultStart(now));
  };
  const pickTime = (hhmm: string) => setStart(atTime(start, hhmm));

  const badName = flagged && !name.trim();
  const badStart = flagged && start.getTime() <= nowMs;

  const onConfirm = async () => {
    const failing =
      !name.trim() ||
      start.getTime() <= Date.now() ||
      place.locationMode === undefined ||
      (place.locationMode === 'manual' && !(place.manualLocationAddress ?? '').trim()) ||
      (place.courtIds != null && place.courtIds.length === 0);
    if (failing) {
      setFlagged(true);
      setMessage(tc('missingInformation'));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const overrides: Record<string, unknown> = { name: name.trim(), starts_at: start.toISOString() };
      if (courtsOrLocationChanged(place, event, courtIds)) {
        Object.assign(overrides, locationOverrides(place, (number) => t('courtNamePlaceholder', { number })));
      }
      if (thumb && uid) overrides.thumbnail_path = await uploadCommunityImage(thumb.file, uid, 'event-thumbnails');
      const newId = await duplicate.mutateAsync({ eventId: event.id, groupId: event.group_id, overrides });
      if (typeof newId !== 'string') throw new Error('unknown_error');
      onDuplicated(newId);
    } catch (e) {
      setMessage(t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') }));
      setBusy(false);
    }
  };

  const summary: [string, string][] = [
    [t('duplicateGroupLabel'), event.group?.name ?? t('groupBadgeNone')],
    [t('duplicateFormatLabel'), formatLabel(t, event)],
    [t('duplicateModalityLabel'), modalityLabel(t, event)],
    [t('widgetScoring'), scoringLabel(t, event)],
    [t('step8Title'), preferencesSummary(t, event)],
    [t('widgetFee'), feeLabel(t, event)],
  ];

  return (
    <ManageDialog
      title={t('duplicateSheetTitle')}
      onClose={onClose}
      primaryLabel={tc('confirm')}
      onPrimary={() => void onConfirm()}
      busy={busy}
      error={message}
      testId="sheet-duplicate"
    >
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4" data-testid="duplicate-summary">
        <p className="text-xs text-muted-foreground">{t('duplicateInheritedNote')}</p>
        <dl className="flex flex-col gap-1.5">
          {summary.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="space-y-2">
        <Label htmlFor="duplicate-name">
          {t('nameLabel')}
          <span aria-hidden className="text-destructive">
            *
          </span>
        </Label>
        <Input
          id="duplicate-name"
          required
          maxLength={80}
          value={name}
          aria-invalid={badName || undefined}
          aria-describedby={badName ? 'duplicate-name-error' : undefined}
          onChange={(e) => setName(e.target.value)}
          data-testid="duplicate-name"
        />
        <FieldError id="duplicate-name-error" show={badName} />
      </div>

      <ImagePickerRow
        id="duplicate-thumbnail"
        label={t('thumbnailLabel')}
        previewUrl={thumb?.url ?? eventThumbnailUrl(event.thumbnail_path)}
        onPick={(file) => setThumb({ file, url: URL.createObjectURL(file) })}
        onRemove={() => setThumb(null)}
        disabled={busy}
        labels={{ upload: t('uploadImageCta'), change: t('changeImageCta'), remove: t('removeImageCta') }}
        testId="duplicate-thumbnail"
      />

      <section aria-labelledby="duplicate-date" className="flex flex-col gap-3 rounded-xl border p-4">
        <h3 id="duplicate-date" className="font-semibold">
          {t('dateLabel')}
        </h3>
        <DayStrip value={start} onChange={pickDay} today={today} label={t('dateLabel')} />
      </section>
      <section aria-labelledby="duplicate-time" className="flex flex-col gap-3 rounded-xl border p-4">
        <h3 id="duplicate-time" className="font-semibold">
          {t('timeLabel')}
        </h3>
        <TimeSlotPicker day={start} value={timeOf(start)} onChange={pickTime} now={now} />
        {badStart ? (
          <p role="alert" className="text-sm text-destructive">
            {t('startTimeError')}
          </p>
        ) : null}
      </section>
      <p className="font-semibold" data-testid="duplicate-when">
        {formatEventWhen(start, event.duration_minutes, i18n.language)}
      </p>

      <section aria-labelledby="duplicate-location" className="flex flex-col gap-3">
        <h3 id="duplicate-location" className="font-semibold">
          {t('duplicateLocationLabel')}
        </h3>
        <LocationBody draft={place} patch={patchPlace} communityId="" flagged={flagged} nowMs={nowMs} />
      </section>
    </ManageDialog>
  );
}
