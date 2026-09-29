/**
 * An Upcoming occurrence of a recurring event (UX-MEVT-22, decision 5), opened from Manage Event's
 * "Next occurrences". `[id]` is the event whose Manage screen listed it; `?slot=` the Lisbon date of
 * the weekly slot (`event_next_occurrences.slot_date`). The occurrence does not exist as an event
 * yet, so the page is the standard event look with what it will carry — name, date, time,
 * location, description and the read-only widgets — and nothing tied to participation: no players,
 * confirmations, teams or matches.
 *
 * The header's settings icon does not open the dashboard: it opens a sheet with
 *   Edit date & time          the Date & Time sheet scoped to this occurrence (no Repeat card, no
 *                             duration) → update_occurrence_slot
 *   Send invitation now       confirmation → send_occurrence_now; it becomes Scheduled
 *   Cancel this occurrence    confirmation → cancel_occurrence_slot; the series goes on
 */
import {
  useCancelOccurrenceSlot,
  useEvent,
  useEventNextOccurrences,
  useSendOccurrenceNow,
  useUpdateOccurrenceSlot,
  type EventDetail,
  type EventOccurrence,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventThumb } from '@/components/event/EventThumb';
import { InfoWidgets, LocationCard } from '@/components/event/EventDetailParts';
import { draftFromEvent } from '@/components/event/manage/eventDraft';
import { ManageSheet } from '@/components/event/manage/ManageSheet';
import { occurrencePlace } from '@/components/event/manage/NextOccurrences';
import type { EventDraft } from '@/components/event/wizard/draft';
import { validateStep7 } from '@/components/event/wizard/stepValidators';
import { DateSummaryFooter, Step7Schedule } from '@/components/event/wizard/steps/Step7Schedule';
import { openInMaps } from '@/lib/eventLocation';
import { eventSubtitle } from '@/lib/eventFormat';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import { Badge, EmptyState, Text, TopBar, useActionSheet, useBanner } from '../../../components/ui';

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

export default function OccurrenceScreen() {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const goBack = useGoBack();
  const { id, slot } = useLocalSearchParams<{ id: string; slot: string }>();
  const { data: event, isLoading, isError, refetch } = useEvent(id);
  const occurrences = useEventNextOccurrences(id);

  if (isLoading || occurrences.isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }
  if (isError || occurrences.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} />
        <EmptyState
          fill
          tone="error"
          title={tc('loadError')}
          action={{ label: tc('retry'), onPress: () => void Promise.all([refetch(), occurrences.refetch()]) }}
          testID="occurrence-load-error"
        />
      </SafeAreaView>
    );
  }
  // Organizer only (event_next_occurrences answers nobody else), and only while still Upcoming:
  // sent or cancelled, it has left this list.
  const occurrence = occurrences.data?.find((o) => o.slot_date === slot && o.status === 'upcoming');
  if (event == null || event.series_id == null || occurrence == null) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} />
        <EmptyState fill title={t('occurrence_not_found')} testID="occurrence-gone" />
      </SafeAreaView>
    );
  }
  return <Occurrence event={event} seriesId={event.series_id} occurrence={occurrence} />;
}

function Occurrence({ event, seriesId, occurrence }: { event: EventDetail; seriesId: string; occurrence: EventOccurrence }) {
  const { t, i18n } = useT('event');
  const goBack = useGoBack();
  const banner = useBanner();
  const showSheet = useActionSheet();
  const sendNow = useSendOccurrenceNow(event.id);
  const cancelSlot = useCancelOccurrenceSlot(event.id);
  const [editOpen, setEditOpen] = useState(false);
  const lang = i18n.language;
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

  const fail = (e: unknown) => banner.show(t(e instanceof Error ? e.message : 'unknown_error'));

  const onSettings = async () => {
    if (busy) return;
    const key = await showSheet({
      title: t('occurrenceSettingsTitle'),
      actions: [
        { key: 'edit', label: t('occurrenceEditDate') },
        {
          key: 'send',
          label: t('occurrenceSendNow'),
          confirm: {
            title: t('occurrenceSendNowTitle'),
            body: t('occurrenceSendNowBody'),
            confirmLabel: t('occurrenceSendNowConfirm'),
          },
        },
        {
          key: 'cancel',
          label: t('occurrenceCancel'),
          destructive: true,
          confirm: {
            title: t('occurrenceCancelTitle'),
            body: t('occurrenceCancelBody'),
            confirmLabel: t('occurrenceCancelConfirm'),
          },
        },
      ],
    });
    if (key === 'edit') setEditOpen(true);
    else if (key === 'send') {
      try {
        await sendNow.mutateAsync(slotArgs);
        banner.show(t('occurrenceSentToast'), 'success');
        goBack();
      } catch (e) {
        fail(e);
      }
    } else if (key === 'cancel') {
      try {
        await cancelSlot.mutateAsync(slotArgs);
        banner.show(t('occurrenceCancelledToast'), 'success');
        goBack();
      } catch (e) {
        fail(e);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        onBack={goBack}
        backLabel={t('back')}
        actions={[
          {
            icon: (
              <SymbolView
                name={{ ios: 'gearshape', android: 'settings', web: 'settings' } as never}
                tintColor={colors.foreground}
                size={22}
              />
            ),
            label: t('occurrenceSettingsTitle'),
            onPress: () => void onSettings(),
            testID: 'occurrence-settings',
          },
        ]}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <EventThumb path={event.thumbnail_path} shape="hero" />
        </View>
        <View style={styles.section}>
          <Text variant="title" accessibilityRole="header">
            {occurrence.name ?? event.name}
          </Text>
          <Text variant="body" tone="muted" style={styles.subtitle} testID="occurrence-when">
            {eventSubtitle(occurrence.starts_at, placeName, lang)}
          </Text>
          <View style={styles.badges}>
            <Badge label={t('occurrenceUpcoming')} tone="neutral" />
            <Badge label={t('recurrentTag')} tone="primary" />
          </View>
        </View>
        {event.description ? (
          <View style={styles.section}>
            <Text variant="body">{event.description}</Text>
          </View>
        ) : null}
        <View style={styles.section}>
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
        </View>
        {place ? (
          <View style={styles.section}>
            <LocationCard place={place} onPress={() => void openInMaps(place).catch(() => undefined)} />
          </View>
        ) : null}
      </ScrollView>
      {editOpen ? (
        <OccurrenceDateSheet
          event={event}
          seriesId={seriesId}
          occurrence={occurrence}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            banner.show(t('eventSavedToast'), 'success');
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Edit Date & Time for one Upcoming occurrence: its start only (update_occurrence_slot). */
function OccurrenceDateSheet({
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
  const [draft, setDraft] = useState<EventDraft>(() => ({
    ...draftFromEvent(event),
    startsAt: new Date(occurrence.starts_at).toISOString(),
    durationMinutes: occurrence.duration_minutes,
  }));
  const patch = useCallback((p: Partial<EventDraft>) => setDraft((prev) => ({ ...prev, ...p })), []);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const clearError = useCallback((key: string) => setErrors((prev) => prev.filter((k) => k !== key)), []);

  const onSave = async () => {
    const failing = validateStep7(draft).filter((k) => k === 'startsAt');
    if (failing.length > 0) {
      setErrors(failing);
      setMessage(t('startTimeError'));
      return;
    }
    setMessage(null);
    try {
      await update.mutateAsync({ seriesId, slotDate: occurrence.slot_date, startsAt: draft.startsAt! });
      onSaved();
    } catch (e) {
      setMessage(t(e instanceof Error ? e.message : 'unknown_error'));
    }
  };

  const props = { draft, patch, errors, clearError };
  return (
    <ManageSheet
      title={t('editDateTimeTitle')}
      onClose={onClose}
      primaryLabel={t('sheetSave')}
      onPrimary={() => void onSave()}
      busy={update.isPending}
      error={message}
      testID="sheet-occurrence-date"
    >
      <Step7Schedule {...props} context="occurrence" />
      <DateSummaryFooter {...props} />
    </ManageSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: space[8] },
  section: { paddingHorizontal: space[4], paddingTop: space[4] },
  subtitle: { marginTop: space[1] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },
});
