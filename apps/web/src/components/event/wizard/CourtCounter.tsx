'use client';
import { useId } from 'react';
import { useT } from '@padel/i18n';
import { COURTS_MAX, COURTS_MIN } from '@padel/utils';
import { Button } from '@/components/ui/button';

/**
 * Number of courts, 1–20 (decision 9). The Courts step, and the manual venue form on Location.
 * What the count means for the roster is `CapacityLine`, shown under it on Courts.
 */
export function CourtCounter({
  value,
  onChange,
  invalid,
}: {
  value: number;
  onChange: (n: number) => void;
  invalid?: boolean;
}) {
  const { t } = useT('event');
  const id = useId();
  const set = (n: number) => onChange(Math.min(COURTS_MAX, Math.max(COURTS_MIN, n)));
  return (
    <div className="space-y-2" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="text-sm font-medium">
        {t('courtsLabel')}
      </span>
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('courtsDecreaseLabel')}
          aria-controls={`${id}-count`}
          disabled={value <= COURTS_MIN}
          onClick={() => set(value - 1)}
        >
          &minus;
        </Button>
        <span
          id={`${id}-count`}
          aria-live="polite"
          aria-invalid={invalid || undefined}
          className="w-8 text-center text-lg font-medium tabular-nums"
          data-testid="event-wizard-courts"
        >
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('courtsIncreaseLabel')}
          aria-controls={`${id}-count`}
          disabled={value >= COURTS_MAX}
          onClick={() => set(value + 1)}
        >
          +
        </Button>
      </div>
    </div>
  );
}
