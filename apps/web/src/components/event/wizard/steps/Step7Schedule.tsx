'use client';
import { useMemo, useState } from 'react';
import { useT } from '@padel/i18n';
import {
  atTime,
  DEFAULT_INVITE_LEAD,
  defaultStart,
  DURATION_MAX,
  DURATION_MIN,
  DURATION_PRESETS,
  formatEventWhen,
  formatShortDay,
  INVITE_LEAD_OPTIONS,
  type InviteLeadDays,
  inviteDate,
  isDurationPreset,
  nextWeekly,
  timeOf,
} from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useNow } from '@/lib/useNow';
import { DayStrip } from '../DayStrip';
import { dateErrors, deriveSeries } from '../draft-logic';
import { NumberDialog } from '../NumberDialog';
import { SegmentedRadio } from '../SegmentedRadio';
import { TimeSlotPicker } from '../TimeSlotPicker';
import type { StepProps } from '../types';

const parseStart = (iso: string | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

function Card({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Date (UX-CEVT-08): four cards with room between them — Date (a day strip with inline month
 * labels), Time (period tabs over a grid of start times), Duration (60 / 90 / 120 + Custom in a
 * dialog) and, for group events, Repeat every week (a switch that expands to when the next
 * occurrence's invitation goes out). The summary of when it happens is `DateSummaryFooter`, fixed
 * at the bottom with the primary button. Mirrors mobile's Step7Schedule.
 */
export function Step7Schedule({
  draft,
  patch,
  flagged,
  context = 'wizard',
  recurring = false,
}: StepProps & {
  /**
   * `edit`: Manage Event's Edit Date & Time dialog (UX-MEVT-08). Repeat every week is shown
   * read-only there until recurrence editing ships with migration 0123 (W5).
   */
  context?: 'wizard' | 'edit';
  /** Edit only: whether the event belongs to an active weekly series. */
  recurring?: boolean;
}) {
  const { t } = useT('event');
  const nowMs = useNow(60_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  // Midnight today, rebuilt only when the date changes — the day strip is keyed off it.
  const [y, m, d] = [now.getFullYear(), now.getMonth(), now.getDate()];
  const today = useMemo(() => new Date(y, m, d), [y, m, d]);
  const [customOpen, setCustomOpen] = useState(false);

  const start = parseStart(draft.startsAt);
  const lead: InviteLeadDays = draft.series?.inviteLeadDays ?? DEFAULT_INVITE_LEAD;
  const repeatOn = draft.series != null;
  const errors = flagged ? dateErrors(draft, nowMs) : [];

  // The start is never empty here: entering the step sets the default (`onEnterStep`), so the
  // time tabs open on the right period on the first render.

  /** Every change re-derives the series, so a recurring event follows its first occurrence. */
  const update = (next: { startsAt?: string; durationMinutes?: number }) => {
    const startsAt = next.startsAt ?? draft.startsAt;
    const durationMinutes = next.durationMinutes ?? draft.durationMinutes;
    patch({ ...next, ...(repeatOn ? { series: deriveSeries(startsAt, durationMinutes, lead) } : {}) });
  };

  const pickDay = (day: Date) => {
    // The time is kept across days — unless on the new day it has already gone (today, earlier
    // than now), when the start snaps to the first free slot instead.
    const kept = start ? atTime(day, timeOf(start)) : null;
    const next = kept && kept.getTime() > now.getTime() ? kept : defaultStart(now);
    update({ startsAt: next.toISOString() });
  };
  const pickTime = (hhmm: string) => update({ startsAt: atTime(start ?? today, hhmm).toISOString() });

  const custom = !isDurationPreset(draft.durationMinutes);

  return (
    <div className="flex flex-col gap-5">
      <Card title={t('dateLabel')} id="date-card-date">
        <DayStrip value={start} onChange={pickDay} today={today} label={t('dateLabel')} />
      </Card>

      <Card title={t('timeLabel')} id="date-card-time">
        <TimeSlotPicker day={start ?? today} value={start ? timeOf(start) : null} onChange={pickTime} now={now} />
        {errors.includes('startsAt') ? (
          <p role="alert" className="text-sm text-destructive">
            {t('startTimeError')}
          </p>
        ) : null}
      </Card>

      <Card title={t('durationCardTitle')} id="date-card-duration">
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="date-card-duration">
          {DURATION_PRESETS.map((mins) => (
            <Button
              key={mins}
              type="button"
              size="sm"
              variant={draft.durationMinutes === mins ? 'primary' : 'secondary'}
              aria-pressed={draft.durationMinutes === mins}
              onClick={() => update({ durationMinutes: mins })}
              className="rounded-full"
              data-testid={`duration-${mins}`}
            >
              {t('minutesValue', { count: mins })}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={custom ? 'primary' : 'secondary'}
            aria-pressed={custom}
            onClick={() => setCustomOpen(true)}
            className="rounded-full"
            data-testid="duration-custom"
          >
            {custom ? t('durationCustomValue', { count: draft.durationMinutes }) : t('durationCustom')}
          </Button>
        </div>
        {errors.includes('durationMinutes') ? (
          <p role="alert" className="text-sm text-destructive">
            {t('customDurationError')}
          </p>
        ) : null}
      </Card>

      {/* TODO(0123, W5): turn recurrence on/off here (set_event_recurrence). Until then it is shown
          as it is and cannot be changed — never a switch that does nothing. */}
      {context === 'edit' && draft.groupId ? (
        <section aria-label={t('repeatLabel')} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <label htmlFor="repeat-weekly" className="font-semibold">
                {t('repeatLabel')}
              </label>
              <p id="repeat-weekly-hint" className="text-sm text-muted-foreground">
                {t('repeatEditLater')}
              </p>
            </div>
            <Switch
              id="repeat-weekly"
              checked={recurring}
              disabled
              aria-describedby="repeat-weekly-hint"
              data-testid="repeat-weekly"
            />
          </div>
        </section>
      ) : null}

      {/* Recurrence is group-only; a standalone event has nobody to re-invite (plan-capped on create). */}
      {context === 'wizard' && draft.groupId ? (
        <section aria-label={t('repeatLabel')} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <label htmlFor="repeat-weekly" className="font-semibold">
                {t('repeatLabel')}
              </label>
              <p id="repeat-weekly-hint" className="text-sm text-muted-foreground">
                {t('repeatHint')}
              </p>
            </div>
            <Switch
              id="repeat-weekly"
              checked={repeatOn}
              aria-describedby="repeat-weekly-hint"
              onCheckedChange={(on) =>
                patch({ series: on ? deriveSeries(draft.startsAt, draft.durationMinutes, lead) : undefined })
              }
              data-testid="repeat-weekly"
            />
          </div>
          {repeatOn ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t('inviteLeadLabel')}</span>
              <SegmentedRadio<`${InviteLeadDays}`>
                label={t('inviteLeadLabel')}
                options={INVITE_LEAD_OPTIONS.map((days) => ({ value: `${days}`, label: t(`inviteLead${days}`) }))}
                value={`${lead}`}
                onChange={(v) =>
                  patch({
                    series: deriveSeries(draft.startsAt, draft.durationMinutes, Number(v) as InviteLeadDays),
                  })
                }
                testId="invite-lead"
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <NumberDialog
        open={customOpen}
        title={t('customDurationTitle')}
        hint={t('customDurationHint')}
        error={t('customDurationError')}
        saveLabel={t('customPointsSave')}
        min={DURATION_MIN}
        max={DURATION_MAX}
        initial={custom ? draft.durationMinutes : null}
        onClose={() => setCustomOpen(false)}
        onSave={(mins) => {
          update({ durationMinutes: mins });
          setCustomOpen(false);
        }}
        testId="custom-duration"
      />
    </div>
  );
}

/**
 * The summary box (UX-CEVT-08), fixed at the bottom with the primary button so it stays in view
 * while the cards scroll: when the event happens, and — when it repeats — the next occurrence and
 * the day its invitations go out.
 */
export function DateSummaryFooter({ draft }: StepProps) {
  const { t, i18n } = useT('event');
  const locale = i18n.language;
  const start = parseStart(draft.startsAt);
  const next = start && draft.series ? nextWeekly(start) : null;

  return (
    <div className="mb-3 flex flex-col gap-0.5 rounded-lg bg-accent p-3" aria-live="polite" data-testid="date-summary">
      <span className="text-xs font-medium text-muted-foreground">{t('summaryTitle')}</span>
      <span className="font-semibold">
        {start ? formatEventWhen(start, draft.durationMinutes, locale) : t('summaryPickTime')}
      </span>
      {next && draft.series ? (
        <>
          <span className="text-sm">{t('summaryRepeats', { date: formatShortDay(next, locale) })}</span>
          <span className="text-sm text-muted-foreground">
            {t('summaryInvite', { date: formatShortDay(inviteDate(next, draft.series.inviteLeadDays), locale) })}
          </span>
        </>
      ) : null}
    </div>
  );
}
