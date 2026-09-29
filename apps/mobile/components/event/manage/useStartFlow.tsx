import {
  useEventParticipants,
  useStartEvent,
  useStartEventCheck,
  type EventDetail,
  type EventType,
  type StartBlocker,
  type StartWarning,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../../theme';
import { BottomSheet, Button, Text, useBanner } from '../../ui';

type SheetState = { kind: 'blocked'; blockers: StartBlocker[] } | { kind: 'warn'; warnings: StartWarning[] } | null;

/**
 * Start event (UX-MEVT-23, decision 1), shared by the event page (from the scheduled time) and
 * Manage Event (any time — an early start). A tap asks the server (`start_event_check`) rather
 * than guessing from the cached roster:
 *
 *   blockers  fewer than 4 confirmed, an odd count with stand-by off, a mixed event with men ≠
 *             women (or a gender missing), a team event with an incomplete team → a blocking sheet
 *             naming each one, with "Manage players" and no way to start anyway;
 *   warnings  spots still open, a court left idle → a sheet stating them, "Add more players"
 *             (Manage players) or "Start anyway";
 *   neither   starts straight away.
 *
 * The button never looks disabled (UX-GLOB-06). Returns the tap handler and the sheet to render.
 * Takes the id separately so the event page can call it before its loading/no-access returns.
 */
export function useStartFlow(
  eventId: string,
  event: EventDetail | null | undefined,
): { onStart: () => void; pending: boolean; sheet: ReactNode } {
  const { t } = useT('event');
  const router = useRouter();
  const banner = useBanner();
  const { data: participantsData } = useEventParticipants(eventId);
  // Fetched on the tap, never in the background: the roster may have moved since the page loaded.
  const check = useStartEventCheck(eventId, false);
  const startEvent = useStartEvent(eventId);
  const [checking, setChecking] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);

  const fail = (e: unknown) => banner.show(t(e instanceof Error ? e.message : 'unknown_error'));

  const start = async () => {
    if (event == null) return;
    // The server counts status='confirmed' regardless of is_standby; seeding is by join order.
    const confirmed = (participantsData ?? [])
      .filter((p) => p.status === 'confirmed')
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map((p) => p.id);
    try {
      await startEvent.mutateAsync({
        eventType: event.event_type as EventType,
        specification: event.specification,
        confirmedParticipantIds: confirmed,
        numCourts: event.num_courts,
      });
      router.push(`/event/${eventId}/live` as Href);
    } catch (e) {
      fail(e);
    }
  };

  const onStart = () => {
    if (event == null || checking || startEvent.isPending) return;
    setChecking(true);
    void check
      .refetch()
      .then(async ({ data, error }) => {
        if (error || data == null) throw error ?? new Error('unknown_error');
        if (data.blockers.length > 0) setSheet({ kind: 'blocked', blockers: data.blockers });
        else if (data.warnings.length > 0) setSheet({ kind: 'warn', warnings: data.warnings });
        else await start();
      })
      .catch(fail)
      .finally(() => setChecking(false));
  };

  const close = () => setSheet(null);
  const toManagePlayers = () => {
    close();
    router.push(`/event/${eventId}/manage-players` as Href);
  };
  const startAnyway = () => {
    close();
    void start();
  };

  const warningLine = (w: StartWarning) =>
    w.code === 'below_capacity'
      ? t('startWarnOpenSpots', { count: w.open_spots })
      : t('startWarnIdleCourts', { count: w.idle });

  const node =
    sheet == null ? null : (
      <BottomSheet
        visible
        onClose={close}
        title={t(sheet.kind === 'blocked' ? 'startBlockedTitle' : 'startWarnTitle')}
        testID={sheet.kind === 'blocked' ? 'start-blocked-sheet' : 'start-warn-sheet'}
      >
        <View style={styles.lines}>
          {sheet.kind === 'blocked'
            ? sheet.blockers.map((b) => (
                <Text key={b} variant="body" testID={`start-blocker-${b}`}>
                  {t(b)}
                </Text>
              ))
            : sheet.warnings.map((w) => (
                <Text key={w.code} variant="body" testID={`start-warning-${w.code}`}>
                  {warningLine(w)}
                </Text>
              ))}
        </View>
        <View style={styles.buttons}>
          {sheet.kind === 'blocked' ? (
            <>
              <Button label={t('managePlayersTitle')} fullWidth onPress={toManagePlayers} testID="start-manage-players" />
              <Button label={t('startSheetClose')} variant="secondary" fullWidth onPress={close} testID="start-close" />
            </>
          ) : (
            <>
              <Button label={t('startAnywayCta')} fullWidth onPress={startAnyway} testID="start-anyway" />
              <Button
                label={t('addMorePlayersCta')}
                variant="secondary"
                fullWidth
                onPress={toManagePlayers}
                testID="start-add-players"
              />
            </>
          )}
        </View>
      </BottomSheet>
    );

  return { onStart, pending: checking || startEvent.isPending, sheet: node };
}

const styles = StyleSheet.create({
  lines: { gap: space[2], paddingHorizontal: space[2], marginBottom: space[4] },
  buttons: { gap: space[2], paddingHorizontal: space[2] },
});
