'use client';
import { useId } from 'react';
import { Button } from '@/components/ui/button';

/**
 * A labelled − n + counter bounded to [min, max]: Preferences' extra stand-by spots (1–20). The
 * buttons at a bound are disabled, so the value can never leave the range.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
  invalid,
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
  invalid?: boolean;
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
          disabled={value <= min}
          onClick={() => set(value - 1)}
        >
          &minus;
        </Button>
        <span
          id={`${id}-count`}
          aria-live="polite"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
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
          disabled={value >= max}
          onClick={() => set(value + 1)}
        >
          +
        </Button>
      </div>
    </div>
  );
}
