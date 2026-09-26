'use client';
import { useEffect } from 'react';
import { useT } from '@padel/i18n';
import { useVenueCourts } from '@padel/api';
import { COURTS_MAX, eventCapacity } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CourtCounter } from '../CourtCounter';
import { clampCourts, courtsErrors, setCourtSelection, toggleCourt } from '../draft-logic';
import { InfoNote } from '../InfoNote';
import { SegmentedRadio } from '../SegmentedRadio';
import type { StepProps } from '../types';

type Selection = 'select' | 'count';

/**
 * Courts (UX-CEVT-07). The step follows how Location was answered, as on mobile:
 *
 * - A registry venue: "Select courts" (its courts as checkboxes, with a note that this books
 *   nothing) or "Have not reserved yet" (the count only). Ticked courts become the event's courts
 *   and their number its court count.
 * - No location (a manual venue never reaches this step — its courts are on its form): the count.
 *
 * Below, in every case, what the count means: 4 players a court, split per gender on a mixed event.
 */
export function Step6Courts({ draft, patch, flagged }: StepProps) {
  const { t } = useT('event');
  const courts = useVenueCourts(draft.venueId);
  const venueCourts = courts.data ?? [];
  const selection: Selection = draft.courtIds ? 'select' : 'count';
  const hasCourtList = !!draft.venueId && venueCourts.length > 0;
  const errors = flagged ? courtsErrors(draft) : [];

  // With no court list on screen (the query failed, or the venue has no courts) a selection left
  // over from "Select courts" could not be seen or fixed, yet would fail validation — drop it.
  const listSettled = !draft.venueId || courts.isSuccess || courts.isError;
  const staleSelection = listSettled && !hasCourtList && draft.courtIds !== undefined;
  useEffect(() => {
    if (staleSelection) patch({ courtIds: undefined });
  }, [staleSelection, patch]);
  const atCap = (draft.courtIds?.length ?? 0) >= COURTS_MAX;

  const counter = (
    <CourtCounter
      value={draft.numCourts}
      onChange={(n) => patch({ numCourts: clampCourts(n) })}
      invalid={errors.includes('numCourts')}
    />
  );

  let top: React.ReactNode;
  if (draft.venueId && courts.isLoading) {
    top = <Skeleton className="h-32" />;
  } else if (draft.venueId && courts.isError) {
    // The count still works without the list, so the counter stays under the error.
    top = (
      <>
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border p-4" data-testid="venue-courts-error">
          <p className="text-sm font-medium">{t('venueCourtsErrorTitle')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void courts.refetch()}>
            {t('venueRetry')}
          </Button>
        </div>
        {counter}
      </>
    );
  } else if (hasCourtList) {
    const badPick = errors.includes('courtIds');
    top = (
      <>
        <SegmentedRadio<Selection>
          label={t('step6Title')}
          options={[
            { value: 'select', label: t('courtsSelectOption') },
            { value: 'count', label: t('courtsNotReservedOption') },
          ]}
          value={selection}
          onChange={(v) => patch(setCourtSelection(draft, v === 'select'))}
          testId="courts-mode"
        />
        {selection === 'select' ? (
          <>
            <InfoNote text={t('courtsNoReserveBanner')} testId="courts-no-reserve-note" />
            <fieldset
              className={cn('flex flex-col gap-1 rounded-lg border p-2', badPick && 'border-destructive')}
              aria-describedby={badPick ? 'courts-select-error' : undefined}
            >
              <legend className="sr-only">{t('courtsSelectOption')}</legend>
              {venueCourts.map((c) => (
                <label
                  key={c.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary"
                    // Ticking more than 20 courts is not allowed; the ticked ones can still be unticked.
                    disabled={atCap && !draft.courtIds?.includes(c.id)}
                    checked={draft.courtIds?.includes(c.id) ?? false}
                    onChange={() => patch(toggleCourt(draft, c.id))}
                    data-testid={`venue-court-${c.id}`}
                  />
                  <span className="text-sm">{c.name}</span>
                </label>
              ))}
            </fieldset>
            {badPick ? (
              <p id="courts-select-error" className="text-sm text-destructive">
                {t('courtsSelectError')}
              </p>
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
          <p className="text-sm text-muted-foreground">{t('venueCourtsEmpty')}</p>
        ) : null}
        {counter}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {top}
      <CapacityLine draft={draft} />
    </div>
  );
}

/** "Capacity: 12 players · 4 per court", plus the per-gender split and stand-by spots when set. */
function CapacityLine({ draft }: Pick<StepProps, 'draft'>) {
  const { t } = useT('event');
  const standby = draft.allowStandby ? (draft.standbySpots ?? 0) : 0;
  const { players, perGender } = eventCapacity(draft.numCourts, draft.specification, standby);
  return (
    <div className="flex flex-col gap-1 border-t pt-3" aria-live="polite" data-testid="courts-capacity">
      <p className="text-sm font-medium">{t('capacityPlayers', { count: players })}</p>
      {perGender != null ? (
        <p className="text-sm text-muted-foreground">{t('capacityMixed', { count: perGender })}</p>
      ) : null}
      {standby > 0 ? <p className="text-sm text-muted-foreground">{t('capacityStandby', { count: standby })}</p> : null}
    </div>
  );
}
