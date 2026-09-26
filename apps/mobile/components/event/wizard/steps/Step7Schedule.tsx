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
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useNow } from '@/lib/useNow';

import { DayScroller } from '../DayScroller';
import type { EventDraft, WizardStepProps } from '../draft';
import { NumberSheet } from '../NumberSheet';
import { TimeSlotPicker } from '../TimeSlotPicker';
import { colors, radius, space } from '../../../../theme';
import { Card, Chip, SwitchRow, Text } from '../../../ui';

/** The weekly series a recurring event carries, derived from its start and duration. */
function deriveSeries(
  startsAt: string | undefined,
  durationMinutes: number,
  inviteLeadDays: InviteLeadDays,
): EventDraft['series'] {
  if (!startsAt) return undefined;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return undefined;
  return {
    dayOfWeek: d.getDay() === 0 ? 7 : d.getDay(),
    startTime: timeOf(d),
    durationMinutes,
    inviteLeadDays,
  };
}

const parseStart = (iso: string | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Date (UX-CEVT-08): four cards with room between them — Date (a day scroller with inline month
 * labels), Time (period tabs over a grid of start times), Duration (60 / 90 / 120 + Custom in a
 * sheet) and, for group events, Repeat every week (a toggle that expands to when the next
 * occurrence's invitation goes out). The summary of when it happens is not here: it is
 * `DateSummaryFooter`, fixed at the bottom with the primary button.
 */
export function Step7Schedule({ draft, patch, errors, clearError }: WizardStepProps) {
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

  // Opens on a start already chosen: the first free slot an hour or more from now.
  useEffect(() => {
    if (!draft.startsAt) patch({ startsAt: defaultStart(new Date()).toISOString() });
  }, [draft.startsAt, patch]);

  /** Every change re-derives the series, so a recurring event follows its first occurrence. */
  const update = (next: { startsAt?: string; durationMinutes?: number }) => {
    const startsAt = next.startsAt ?? draft.startsAt;
    const durationMinutes = next.durationMinutes ?? draft.durationMinutes;
    patch({
      ...next,
      ...(repeatOn ? { series: deriveSeries(startsAt, durationMinutes, lead) } : {}),
    });
  };

  const pickDay = (day: Date) => {
    update({ startsAt: atTime(day, start ? timeOf(start) : timeOf(defaultStart(now))).toISOString() });
    clearError?.('startsAt');
  };
  const pickTime = (hhmm: string) => {
    update({ startsAt: atTime(start ?? today, hhmm).toISOString() });
    clearError?.('startsAt');
  };
  const pickDuration = (m: number) => {
    update({ durationMinutes: m });
    clearError?.('durationMinutes');
  };

  const custom = !isDurationPreset(draft.durationMinutes);

  return (
    <View style={styles.container}>
      <Card padding="md" style={styles.card}>
        <Text variant="sectionTitle">{t('dateLabel')}</Text>
        <DayScroller value={start} onChange={pickDay} today={today} />
      </Card>

      <Card padding="md" style={styles.card}>
        <Text variant="sectionTitle">{t('timeLabel')}</Text>
        <TimeSlotPicker day={start ?? today} value={start ? timeOf(start) : null} onChange={pickTime} now={now} />
        {errors?.includes('startsAt') ? (
          <Text variant="caption" tone="destructive">
            {t('startTimeError')}
          </Text>
        ) : null}
      </Card>

      <Card padding="md" style={styles.card}>
        <Text variant="sectionTitle">{t('durationCardTitle')}</Text>
        <View style={styles.chips}>
          {DURATION_PRESETS.map((m) => (
            <Chip
              key={m}
              label={t('minutesValue', { count: m })}
              selected={draft.durationMinutes === m}
              onPress={() => pickDuration(m)}
              testID={`duration-${m}`}
            />
          ))}
          <Chip
            label={custom ? t('durationCustomValue', { count: draft.durationMinutes }) : t('durationCustom')}
            selected={custom}
            onPress={() => setCustomOpen(true)}
            testID="duration-custom"
          />
        </View>
      </Card>

      {/* Recurrence is group-only; a standalone event has nobody to re-invite (plan-capped on create). */}
      {draft.groupId ? (
        <Card padding="md" style={styles.card}>
          <SwitchRow
            label={t('repeatLabel')}
            description={t('repeatHint')}
            value={repeatOn}
            onValueChange={(on) =>
              patch({ series: on ? deriveSeries(draft.startsAt, draft.durationMinutes, lead) : undefined })
            }
            testID="repeat-weekly"
          />
          {repeatOn ? (
            <View style={styles.lead}>
              <Text variant="label">{t('inviteLeadLabel')}</Text>
              <View style={styles.chips}>
                {INVITE_LEAD_OPTIONS.map((days) => (
                  <Chip
                    key={days}
                    label={t(`inviteLead${days}`)}
                    selected={lead === days}
                    onPress={() => patch({ series: deriveSeries(draft.startsAt, draft.durationMinutes, days) })}
                    testID={`invite-lead-${days}`}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </Card>
      ) : null}

      <NumberSheet
        visible={customOpen}
        title={t('customDurationTitle')}
        hint={t('customDurationHint')}
        error={t('customDurationError')}
        saveLabel={t('customPointsSave')}
        min={DURATION_MIN}
        max={DURATION_MAX}
        initial={custom ? draft.durationMinutes : null}
        onClose={() => setCustomOpen(false)}
        onSave={(m) => {
          pickDuration(m);
          setCustomOpen(false);
        }}
        testID="custom-duration"
      />
    </View>
  );
}

/**
 * The summary box (UX-CEVT-08), fixed at the bottom with the primary button so it stays in view
 * while the cards scroll: when the event happens, and — when it repeats — the next occurrence and
 * the day its invitations go out.
 */
export function DateSummaryFooter({ draft }: WizardStepProps) {
  const { t, i18n } = useT('event');
  const locale = i18n.language;
  const start = parseStart(draft.startsAt);
  const next = start && draft.series ? nextWeekly(start) : null;

  return (
    <View style={styles.summary} accessible testID="date-summary">
      <Text variant="label" tone="muted">
        {t('summaryTitle')}
      </Text>
      <Text variant="bodyStrong">
        {start ? formatEventWhen(start, draft.durationMinutes, locale) : t('summaryPickTime')}
      </Text>
      {next && draft.series ? (
        <>
          <Text variant="caption" tone="default">
            {t('summaryRepeats', { date: formatShortDay(next, locale) })}
          </Text>
          <Text variant="caption" tone="muted">
            {t('summaryInvite', { date: formatShortDay(inviteDate(next, draft.series.inviteLeadDays), locale) })}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[5] },
  card: { gap: space[3] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  lead: { gap: space[2] },
  summary: {
    gap: space[1],
    padding: space[3],
    marginBottom: space[3],
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
});
