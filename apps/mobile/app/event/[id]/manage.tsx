/**
 * Manage Event (UX-MEVT-03) — an overview, reached from the settings icon on the event page (its
 * only entry point). Every card opens a sheet holding only that piece of information
 * (`EventEditSheet`), never the creation steps as one form.
 *
 *   header    back · "Manage Event"; format, modality and group as read-only chips (UX-MEVT-09)
 *   cards     Event name → General Info · Preferences | Scoring · Confirmed | Paid (donuts —
 *             two lists that never merge) · Location → Location & Courts · Date → Date & Time ·
 *             Activity (full screen)
 *   actions   Share, Add to calendar, Send blast, Export, Start event
 *   footer    Duplicate | Cancel
 *
 * Only a scheduled event is editable (update_event refuses anything else): the cards of an event
 * in progress are read-only. A completed event reduces to the Paid donut, the ranking toggle,
 * Activity, Export and Duplicate (decision 16). The Paid card is hidden when there is no fee.
 *
 * `?sheet=<kind>` opens one of the edit sheets on arrival — the event page's Preferences chip and
 * the "Add a location" pending action link here that way.
 */
import {
  type EventDetail,
  useEvent,
  useEventCourts,
  useEventInvitations,
  useEventParticipants,
  useEventTeams,
  useEventSeries,
  useSetEventRanking,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { eventPlace, formatEventWhen, mapsQuery, participationState } from '@padel/utils';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CancelEventSheet } from '@/components/event/manage/CancelEventSheet';
import { DuplicateEventSheet } from '@/components/event/manage/DuplicateEventSheet';
import { EDIT_SHEET_KINDS, EventEditSheet, type EditSheetKind } from '@/components/event/manage/EventEditSheet';
import { formatLabel, modalityLabel, preferencesSummary, scoringLabel } from '@/components/event/manage/eventLabels';
import { ExportSheet } from '@/components/event/manage/ExportSheet';
import { useStartFlow } from '@/components/event/manage/useStartFlow';
import { addToCalendar } from '@/lib/eventCalendar';
import { shareEvent } from '@/lib/eventShare';
import { useGoBack } from '@/lib/useGoBack';
import { useNow } from '@/lib/useNow';
import { Chevron } from '../../../components/event/EventDetailParts';
import { colors, space } from '../../../theme';
import {
  Badge,
  Button,
  Card,
  Donut,
  EmptyState,
  SwitchRow,
  Text,
  TopBar,
  useBanner,
} from '../../../components/ui';

type Sheet = EditSheetKind | 'export' | 'duplicate' | 'cancel';

export default function ManageEventScreen() {
  const { t } = useT('event');
  const { t: tcommon } = useT('common');
  const goBack = useGoBack();
  const { id, sheet } = useLocalSearchParams<{ id: string; sheet?: string }>();
  const uid = useSession().session?.user.id;
  const { data: event, isLoading, isError, refetch } = useEvent(id);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }
  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} title={t('manageEventTitle')} />
        <EmptyState
          fill
          tone="error"
          title={tcommon('loadError')}
          action={{ label: tcommon('retry'), onPress: () => void refetch() }}
          testID="manage-load-error"
        />
      </SafeAreaView>
    );
  }
  // Organizer only: no event (RLS) or someone else's.
  if (event == null || uid == null || uid !== event.organizer_id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} title={t('manageEventTitle')} />
        <EmptyState fill title={t('forbidden')} testID="manage-forbidden" />
      </SafeAreaView>
    );
  }

  const initialSheet = EDIT_SHEET_KINDS.includes(sheet as EditSheetKind) ? (sheet as EditSheetKind) : null;
  return <Dashboard key={event.id} event={event} initialSheet={initialSheet} />;
}

function Dashboard({ event, initialSheet }: { event: EventDetail; initialSheet: Sheet | null }) {
  const { t, i18n } = useT('event');
  const router = useRouter();
  const goBack = useGoBack();
  const banner = useBanner();
  const nowMs = useNow();
  const id = event.id;
  const { data: participantsData } = useEventParticipants(id);
  const { data: teamsData } = useEventTeams(id);
  const { data: invitationsData } = useEventInvitations(id);
  const { data: series } = useEventSeries(id);
  const { data: courtIds } = useEventCourts(id);
  const setRanking = useSetEventRanking(id);
  const startFlow = useStartFlow(id, event);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // A sheet asked for on arrival opens once the push has settled: a Modal presented mid-transition
  // can be dropped by UIKit.
  useEffect(() => {
    if (initialSheet == null) return;
    const handle = setTimeout(() => setSheet(initialSheet), 450);
    return () => clearTimeout(handle);
  }, [initialSheet]);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const participants = participantsData ?? [];
  const completeTeams = (teamsData ?? []).filter((tm) => tm.player_a != null && tm.player_b != null).length;
  const recurring = event.series_id != null && series != null && series.is_active;
  const lang = i18n.language;
  const onToggleRanking = (on: boolean) =>
    void setRanking.mutateAsync(on).catch((e: unknown) => banner.show(t(e instanceof Error ? e.message : 'unknown_error')));
  const rankingPending = setRanking.isPending;

  const status = event.status;
  const editable = status === 'scheduled';
  const completed = status === 'completed';
  const hasFee = event.entrance_fee_enabled;
  const ps = participationState(event, participants, invitationsData ?? [], event.organizer_id, nowMs);
  const confirmed = participants.filter((p) => p.status === 'confirmed');
  const confirmedMain = confirmed.filter((p) => !p.is_standby).length;
  const paid = confirmed.filter((p) => p.has_paid).length;
  const anyonePaid = participants.some((p) => p.has_paid);
  const place = eventPlace(event);
  const isPublicGroup = event.group_id != null && !event.is_private;

  const open = (s: Sheet) => () => setSheet(s);
  const edit = (s: EditSheetKind) => (editable ? open(s) : undefined);

  const onShare = () => void shareEvent(id, event.name).catch(() => undefined);
  const onCalendar = async () => {
    if (calendarBusy) return;
    setCalendarBusy(true);
    const result = await addToCalendar({
      title: event.name,
      startsAt: event.starts_at,
      durationMinutes: event.duration_minutes,
      location: place ? mapsQuery(place) : null,
      notes: event.description,
    }).finally(() => setCalendarBusy(false));
    if (result === 'denied') banner.show(t('calendarDenied'));
    else if (result === 'error') banner.show(t('calendarError'));
  };
  const onStart = async () => {
    if (startFlow.blocker) {
      banner.show(startFlow.blocker);
      return;
    }
    setBusy(true);
    try {
      await startFlow.start();
      router.push(`/event/${id}/live` as Href);
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setBusy(false);
    }
  };

  const confirmedCard = (
    <DashCard
      title={t('dashConfirmedTitle')}
      a11yValue={t('dashRatio', { n: ps.totalIn, total: ps.totalCapacity })}
      // UX-MEVT-26: a team event adds how many pairs are complete under the count.
      detail={event.specification === 'team' ? t('dashTeamsComplete', { count: completeTeams }) : undefined}
      onPress={() => router.push(`/event/${id}/manage-players` as Href)}
      testID="manage-confirmed"
      half
    >
      <Donut value={ps.totalIn} total={ps.totalCapacity} accessibilityLabel={t('dashConfirmedTitle')} decorative />
    </DashCard>
  );
  const paidCard = hasFee ? (
    <DashCard
      title={t('dashPaidTitle')}
      a11yValue={t('dashRatio', { n: paid, total: confirmed.length })}
      onPress={() => router.push(`/event/${id}/payments` as Href)}
      testID="manage-paid"
      half
    >
      <Donut value={paid} total={confirmed.length} accessibilityLabel={t('dashPaidTitle')} decorative />
    </DashCard>
  ) : null;
  const activityCard = (
    <DashCard
      title={t('activityLogCta')}
      onPress={() => router.push(`/event/${id}/activity` as Href)}
      testID="manage-activity"
    />
  );
  const exportAction = (
    <Button label={t('exportDataCta')} variant="secondary" fullWidth onPress={open('export')} testID="manage-export" />
  );
  const duplicateAction = (
    <Button
      label={t('duplicateCta')}
      variant="secondary"
      onPress={open('duplicate')}
      style={styles.flex}
      testID="manage-duplicate"
    />
  );

  const chips = [
    formatLabel(t, event),
    event.specification === 'team' ? t('teamFormatBadge') : modalityLabel(t, event),
    event.group?.name ?? (event.group_id == null ? t('groupBadgeNone') : null),
  ].filter((c): c is string => c != null);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('manageEventTitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chips}>
          {chips.map((c) => (
            <Badge key={c} label={c} tone="primary" />
          ))}
        </View>

        {completed ? (
          <>
            {paidCard ? <View style={styles.row}>{paidCard}</View> : null}
            {isPublicGroup ? (
              <Card padding="md">
                <SwitchRow
                  label={t('rankingToggleLabel')}
                  value={event.counts_for_ranking}
                  onValueChange={onToggleRanking}
                  disabled={rankingPending}
                  testID="manage-ranking"
                />
              </Card>
            ) : null}
            {activityCard}
            <View style={styles.actions}>
              {exportAction}
              <View style={styles.row}>{duplicateAction}</View>
            </View>
          </>
        ) : (
          <>
            <DashCard title={t('dashNameTitle')} value={event.name} onPress={edit('general')} testID="manage-name" />
            <View style={styles.row}>
              <DashCard
                title={t('step8Title')}
                value={preferencesSummary(t, event)}
                onPress={edit('preferences')}
                testID="manage-preferences"
                half
              />
              <DashCard
                title={t('widgetScoring')}
                value={scoringLabel(t, event)}
                onPress={edit('scoring')}
                testID="manage-scoring"
                half
              />
            </View>
            <View style={styles.row}>
              {confirmedCard}
              {paidCard}
            </View>
            <DashCard
              title={t('locationCardTitle')}
              value={place?.name ?? t('noLocationValue')}
              detail={t('dashCourts', { count: event.num_courts })}
              onPress={edit('location')}
              testID="manage-location"
            />
            <DashCard
              title={t('dateLabel')}
              value={formatEventWhen(new Date(event.starts_at), event.duration_minutes, lang)}
              onPress={edit('date')}
              testID="manage-date"
            />
            {activityCard}

            <View style={styles.actions}>
              <Button label={t('shareAction')} variant="secondary" fullWidth onPress={onShare} testID="manage-share" />
              <Button
                label={t('addToCalendarAction')}
                variant="secondary"
                fullWidth
                loading={calendarBusy}
                onPress={() => void onCalendar()}
                testID="manage-calendar"
              />
              {/* Group and group-less events alike (decision 6, migration 0124). */}
              <Button
                label={t('sendBlastCta')}
                variant="secondary"
                fullWidth
                onPress={() => router.push(`/event/${id}/blast` as Href)}
                testID="manage-blast"
              />
              {exportAction}
              {editable ? (
                <Button
                  label={t('startCta')}
                  fullWidth
                  loading={busy || startFlow.pending}
                  onPress={() => void onStart()}
                  testID="manage-start"
                />
              ) : null}
            </View>

            <View style={styles.row}>
              {duplicateAction}
              {editable ? (
                <Button
                  label={t('cancelEventCta')}
                  variant="destructive"
                  onPress={open('cancel')}
                  style={styles.flex}
                  testID="manage-cancel"
                />
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {sheet != null && (EDIT_SHEET_KINDS as readonly string[]).includes(sheet) && editable ? (
        <EventEditSheet
          kind={sheet as EditSheetKind}
          event={event}
          confirmedMain={confirmedMain}
          recurring={recurring}
          courtIds={courtIds}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            banner.show(t('eventSavedToast'), 'success');
          }}
        />
      ) : null}
      {sheet === 'export' ? (
        <ExportSheet
          event={event}
          onClose={() => setSheet(null)}
          onDone={(message, tone) => {
            setSheet(null);
            banner.show(message, tone);
          }}
        />
      ) : null}
      {sheet === 'duplicate' ? (
        <DuplicateEventSheet
          event={event}
          courtIds={courtIds}
          onClose={() => setSheet(null)}
          onDuplicated={(newId) => {
            setSheet(null);
            banner.show(t('duplicatedToast'), 'success');
            router.replace(`/event/${newId}` as Href);
          }}
        />
      ) : null}
      {sheet === 'cancel' ? (
        <CancelEventSheet
          event={event}
          recurring={recurring}
          anyonePaid={anyonePaid}
          onClose={() => setSheet(null)}
          onCancelled={() => {
            setSheet(null);
            banner.show(t('cancelledToast'), 'success');
            goBack();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * One dashboard card: its title, the current value as a subtitle, and a chevron when it opens
 * something. A pressable card is ONE button whose name carries the value ("Scoring, Points · 32"),
 * so a donut inside it is decorative.
 */
function DashCard({
  title,
  value,
  detail,
  a11yValue,
  onPress,
  half = false,
  children,
  testID,
}: {
  title: string;
  value?: string;
  detail?: string;
  /** What a screen reader hears after the title when the value is drawn (a donut). */
  a11yValue?: string;
  onPress?: () => void;
  half?: boolean;
  children?: React.ReactNode;
  testID: string;
}) {
  const label = [title, value, detail, a11yValue].filter(Boolean).join(', ');
  return (
    <Card
      padding="md"
      onPress={onPress}
      style={[styles.card, half && styles.half]}
      accessibilityLabel={onPress ? label : undefined}
      testID={testID}
    >
      <View style={styles.cardHead}>
        <Text variant="label" tone="muted" style={styles.flex} numberOfLines={1}>
          {title}
        </Text>
        {onPress ? <Chevron /> : null}
      </View>
      {value ? (
        <Text variant="bodyStrong" numberOfLines={2}>
          {value}
        </Text>
      ) : null}
      {detail ? (
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      ) : null}
      {children ? <View style={styles.cardChart}>{children}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: space[4], gap: space[3], paddingBottom: space[8] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  row: { flexDirection: 'row', gap: space[3] },
  flex: { flex: 1 },
  card: { gap: space[1] },
  half: { flex: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  cardChart: { alignItems: 'center', paddingTop: space[2] },
  actions: { gap: space[2], marginTop: space[2] },
});
