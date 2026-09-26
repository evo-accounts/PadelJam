import { useVenueCourts } from '@padel/api';
import { useT } from '@padel/i18n';
import { eventCapacity } from '@padel/utils';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CourtCounter } from '../CourtCounter';
import type { WizardStepProps } from '../draft';
import { InfoNote } from '../InfoNote';
import { clampCourts, setCourtSelection, toggleCourt } from '../location';
import { colors, space } from '../../../../theme';
import { Checkbox, EmptyState, Segmented, Text } from '../../../ui';

type Selection = 'select' | 'count';

/**
 * Courts (UX-CEVT-07). The step follows how Location was answered:
 *
 * - A registry venue: "Select courts" (its courts as checkboxes, with a note that this books
 *   nothing) or "Have not reserved yet" (the count only). Ticked courts become the event's courts
 *   and their number its court count.
 * - No location (a manual venue never reaches this step — its courts are on its form): the count.
 *
 * Below, in every case, what the count means: 4 players a court, split per gender on a mixed event.
 */
export function Step6Courts({ draft, patch, errors, clearError }: WizardStepProps) {
  const { t } = useT('event');
  const courts = useVenueCourts(draft.venueId);
  const venueCourts = courts.data ?? [];
  const selection: Selection = draft.courtIds ? 'select' : 'count';
  const hasCourtList = !!draft.venueId && venueCourts.length > 0;

  // With no court list on screen (the query failed, or the venue has no courts) a selection left
  // over from "Select courts" could not be seen or fixed, yet would fail validation — drop it.
  const listSettled = !draft.venueId || courts.isSuccess || courts.isError;
  const staleSelection = listSettled && !hasCourtList && draft.courtIds !== undefined;
  useEffect(() => {
    if (staleSelection) patch({ courtIds: undefined });
  }, [staleSelection, patch]);

  const counter = (
    <CourtCounter
      value={draft.numCourts}
      onChange={(n) => {
        patch({ numCourts: clampCourts(n) });
        clearError?.('numCourts');
      }}
    />
  );

  let top: React.ReactNode;
  if (draft.venueId && courts.isLoading) {
    top = <ActivityIndicator color={colors.foreground} />;
  } else if (draft.venueId && courts.isError) {
    // The count still works without the list, so the counter stays under the error.
    top = (
      <>
        <EmptyState
          tone="error"
          title={t('venueCourtsErrorTitle')}
          action={{ label: t('venueRetry'), onPress: () => void courts.refetch(), variant: 'outline' }}
          testID="venue-courts-error"
        />
        {counter}
      </>
    );
  } else if (hasCourtList) {
    top = (
      <>
        <Segmented<Selection>
          options={[
            { value: 'select', label: t('courtsSelectOption') },
            { value: 'count', label: t('courtsNotReservedOption') },
          ]}
          value={selection}
          onChange={(v) => {
            patch(setCourtSelection(draft, v === 'select'));
            clearError?.('courtIds');
          }}
          testID="courts-mode"
        />
        {selection === 'select' ? (
          <>
            <InfoNote text={t('courtsNoReserveBanner')} testID="courts-no-reserve-note" />
            <View style={styles.checks}>
              {/* Past 20 ticked courts `toggleCourt` refuses more; the ticked ones can still be unticked. */}
              {venueCourts.map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.name}
                  checked={draft.courtIds?.includes(c.id) ?? false}
                  onChange={() => {
                    patch(toggleCourt(draft, c.id));
                    clearError?.('courtIds');
                  }}
                  testID={`venue-court-${c.id}`}
                />
              ))}
            </View>
            {errors?.includes('courtIds') ? (
              <Text variant="caption" tone="destructive">
                {t('courtsSelectError')}
              </Text>
            ) : null}
          </>
        ) : (
          counter
        )}
      </>
    );
  } else {
    top = (
      <>
        {draft.venueId && courts.isSuccess ? (
          <Text variant="caption" tone="muted">
            {t('venueCourtsEmpty')}
          </Text>
        ) : null}
        {counter}
      </>
    );
  }

  return (
    <View style={styles.container}>
      {top}
      <CapacityLine draft={draft} />
    </View>
  );
}

/** "Capacity: 12 players · 4 per court", plus the per-gender split and stand-by spots when set. */
function CapacityLine({ draft }: Pick<WizardStepProps, 'draft'>) {
  const { t } = useT('event');
  const standby = draft.allowStandby ? (draft.standbySpots ?? 0) : 0;
  const { players, perGender } = eventCapacity(draft.numCourts, draft.specification, standby);
  return (
    // Plain View, each line its own element (see InfoNote on accessible grouping Views).
    <View style={styles.capacity}>
      <Text variant="label">{t('capacityPlayers', { count: players })}</Text>
      {perGender != null ? (
        <Text variant="caption" tone="muted">
          {t('capacityMixed', { count: perGender })}
        </Text>
      ) : null}
      {standby > 0 ? (
        <Text variant="caption" tone="muted">
          {t('capacityStandby', { count: standby })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[4] },
  checks: { gap: space[3] },
  capacity: {
    gap: space[1],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
