'use client';
import { useId } from 'react';
import { Button } from '@/components/ui/button';

/**
 * A labelled − n + counter bounded to [min, max]: Preferences' extra stand-by spots (1–20). A
 * button at a bound is `aria-disabled` and does nothing — not `disabled`, which would drop focus
 * from the button just pressed and send keyboard users back to the top of the page.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
  errorId,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  /** The error line's id, while it shows: the count is described by it. */
  errorId?: string;
  testId?: string;
}) {
  const id = useId();
  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));
  return (
    <div className="flex items-center justify-between gap-4" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="text-sm font-medium">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={decreaseLabel}
          aria-controls={`${id}-count`}
          aria-disabled={value <= min || undefined}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (value > min) set(value - 1);
          }}
        >
          &minus;
        </Button>
        <span
          id={`${id}-count`}
          aria-live="polite"
          aria-describedby={errorId}
          className="w-8 text-center text-lg font-medium tabular-nums"
          data-testid={testId}
        >
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={increaseLabel}
          aria-controls={`${id}-count`}
          aria-disabled={value >= max || undefined}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (value < max) set(value + 1);
          }}
        >
          +
        </Button>
      </div>
    </div>
  );
}
