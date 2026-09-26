'use client';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/** Number of courts, with the capacity it implies. Courts step, and the Location step for a manual venue. */
export function CourtCounter({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useT('event');
  return (
    <div className="space-y-2">
      <Label>{t('courtsLabel')}</Label>
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('courtsDecreaseLabel')}
          aria-controls="event-courts-count"
          disabled={value <= 1}
          onClick={() => onChange(Math.max(1, value - 1))}
        >
          &minus;
        </Button>
        <span
          id="event-courts-count"
          aria-live="polite"
          className="w-8 text-center text-lg font-medium"
          data-testid="event-wizard-courts"
        >
          {value}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('courtsIncreaseLabel')}
          aria-controls="event-courts-count"
          onClick={() => onChange(value + 1)}
        >
          +
        </Button>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">{t('capacityHint', { count: value * 4 })}</p>
    </div>
  );
}
