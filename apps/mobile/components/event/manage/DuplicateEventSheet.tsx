/**
 * Duplicate event (UX-MEVT-20, decision 4). A read-only summary of what the copy inherits — group,
 * format, modality, scoring, preferences, fee — over what can be set: name, thumbnail, date, time,
 * and location & courts (the same event often moves to another court of the same club). Nothing
 * about people carries over: the new event starts empty.
 *
 * The date is required and picked here (B8: `duplicate_event` would otherwise default to now,
 * already past the join cut-off). It opens on the same slot a week after the original, or the
 * next such week still ahead.
 *
 * Location and courts are sent (`duplicate_event` overrides, 0122) only when changed here; left
 * alone, the copy keeps the original's venue, courts and point.
 */
import { useDuplicateEvent, type EventDetail } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { atTime, defaultStart, formatEventWhen, geocodeQuery, nextWeekly, timeOf } from '@padel/utils';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { geocodeAddress } from '@/lib/geocode';
import { useNow } from '@/lib/useNow';
import { pickAndValidateImage, uploadCommunityImage, type PickedImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import type { EventDraft } from '../wizard/draft';
import { DayScroller } from '../wizard/DayScroller';
import { TimeSlotPicker } from '../wizard/TimeSlotPicker';
import { space } from '../../../theme';
import { Card, Field, Text } from '../../ui';
import { courtsOrLocationChanged, draftFromEvent, locationChanged, locationOverrides } from './eventDraft';
import { LocationBody } from './EventEditSheet';
import { feeLabel, formatLabel, modalityLabel, preferencesSummary, scoringLabel } from './eventLabels';
import { ManageSheet } from './ManageSheet';

/** The original's slot, a week on — repeated until it is ahead of `now` by the default lead. */
export function duplicateStart(originalIso: string, now: Date): Date {
  let d = nextWeekly(new Date(originalIso));
  for (let i = 0; i < 520 && d.getTime() <= now.getTime() + 60 * 60_000; i += 1) d = nextWeekly(d);
  return d.getTime() > now.getTime() ? d : defaultStart(now);
}

export function DuplicateEventSheet({
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
  const [picked, setPicked] = useState<PickedImage | null>(null);
  // Location & courts, as the Edit Location & Courts sheet edits them.
  const [place, setPlace] = useState<EventDraft>(() => draftFromEvent(event, courtIds));
  const patchPlace = useCallback((p: Partial<EventDraft>) => setPlace((prev) => ({ ...prev, ...p })), []);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const storedUrl = event.thumbnail_path
    ? supabase.storage.from('event-thumbnails').getPublicUrl(event.thumbnail_path).data.publicUrl
    : null;

  const pickDay = (day: Date) => {
    const kept = atTime(day, timeOf(start));
    setStart(kept.getTime() > now.getTime() ? kept : defaultStart(now));
    setErrors((e) => e.filter((k) => k !== 'startsAt'));
  };
  const pickTime = (hhmm: string) => {
    setStart(atTime(start, hhmm));
    setErrors((e) => e.filter((k) => k !== 'startsAt'));
  };

  const onConfirm = async () => {
    const failing = [
      ...(name.trim() ? [] : ['name']),
      ...(start.getTime() > Date.now() ? [] : ['startsAt']),
      ...(place.locationMode === undefined ? ['locationMode'] : []),
      ...(place.locationMode === 'manual' && !(place.manualLocationAddress ?? '').trim() ? ['manualLocationAddress'] : []),
      ...(place.courtIds && place.courtIds.length === 0 ? ['courtIds'] : []),
    ];
    if (failing.length > 0) {
      setErrors(failing);
      setMessage(tc('missingInformation'));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const overrides: Record<string, unknown> = { name: name.trim(), starts_at: start.toISOString() };
      if (courtsOrLocationChanged(place, event, courtIds)) {
        const q = place.hasLocation && locationChanged(place, event)
          ? geocodeQuery({ name: place.manualLocationName, address: place.manualLocationAddress })
          : null;
        const coords = q ? await geocodeAddress(q).catch(() => null) : null;
        Object.assign(
          overrides,
          locationOverrides(place, coords, (n) => t('courtNamePlaceholder', { number: n })),
        );
      }
      if (picked && uid) {
        overrides.thumbnail_path = await uploadCommunityImage(
          supabase,
          'event-thumbnails',
          uid,
          picked.uri,
          picked.mimeType,
        );
      }
      const newId = await duplicate.mutateAsync({ eventId: event.id, groupId: event.group_id, overrides });
      if (typeof newId !== 'string') throw new Error('unknown_error');
      onDuplicated(newId);
    } catch (e) {
      setMessage(t(e instanceof Error ? e.message : 'unknown_error'));
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
    <ManageSheet
      title={t('duplicateSheetTitle')}
      onClose={onClose}
      primaryLabel={tc('confirm')}
      onPrimary={() => void onConfirm()}
      busy={busy}
      error={message}
      testID="sheet-duplicate"
    >
      <Card padding="md" style={styles.summary}>
        <Text variant="caption" tone="muted">
          {t('duplicateInheritedNote')}
        </Text>
        {summary.map(([label, value]) => (
          // Plain View, each Text its own element (see InfoNote on accessible grouping Views).
          <View key={label} style={styles.line}>
            <Text variant="label" tone="muted">
              {label}
            </Text>
            <Text variant="body" style={styles.value} numberOfLines={2}>
              {value}
            </Text>
          </View>
        ))}
      </Card>

      <Field
        label={t('nameLabel')}
        required
        value={name}
        onChangeText={(v) => {
          setName(v);
          setErrors((e) => e.filter((k) => k !== 'name'));
        }}
        maxLength={80}
        error={errors.includes('name') ? tc('required') : undefined}
        testID="duplicate-name"
      />

      <ImagePickerRow
        label={t('thumbnailLabel')}
        variant="cover"
        uri={picked?.uri ?? storedUrl}
        onPress={() => {
          void (async () => {
            const result = await pickAndValidateImage().catch(() => null);
            if (result) setPicked(result);
          })();
        }}
        disabled={busy}
      />

      <Card padding="md" style={styles.card}>
        <Text variant="sectionTitle">{t('dateLabel')}</Text>
        <DayScroller value={start} onChange={pickDay} today={today} />
      </Card>
      <Card padding="md" style={styles.card}>
        <Text variant="sectionTitle">{t('timeLabel')}</Text>
        <TimeSlotPicker day={start} value={timeOf(start)} onChange={pickTime} now={now} />
        {errors.includes('startsAt') ? (
          <Text variant="caption" tone="destructive">
            {t('startTimeError')}
          </Text>
        ) : null}
      </Card>
      <Text variant="bodyStrong" testID="duplicate-when">
        {formatEventWhen(start, event.duration_minutes, i18n.language)}
      </Text>

      <Text variant="sectionTitle">{t('duplicateLocationLabel')}</Text>
      <LocationBody
        draft={place}
        patch={patchPlace}
        errors={errors}
        clearError={(key) => setErrors((e) => e.filter((k) => k !== key))}
      />
    </ManageSheet>
  );
}

const styles = StyleSheet.create({
  summary: { gap: space[2] },
  line: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  value: { flex: 1, textAlign: 'right' },
  card: { gap: space[3] },
});
