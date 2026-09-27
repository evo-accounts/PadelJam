'use client';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import { useT } from '@padel/i18n';
import { dayStrip, sameDay } from '@padel/utils';
import { cn } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The Date card's day row (UX-CEVT-08): a horizontal scroller of the next 60 days. The month's
 * abbreviation sits inline where the row crosses into another month (and before the first day),
 * in the app's language. Only the row scrolls — the page never does sideways.
 *
 * Each day is a button named by its full date ("Saturday, 3 October"); the inline month label is
 * decorative, because every day's name already carries its month. testIDs are `date-day-YYYY-MM-DD`.
 */
export function DayStrip({
  value,
  onChange,
  today,
  label,
}: {
  value: Date | null;
  onChange: (day: Date) => void;
  /** The first day shown. */
  today: Date;
  label: string;
}) {
  const { i18n } = useT('event');
  const locale = i18n.language;
  const days = useMemo(() => dayStrip(today), [today]);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  // Brings a day picked earlier (coming back to the step) into view once, without moving the page.
  useEffect(() => {
    const el = selectedRef.current;
    const row = el?.parentElement;
    if (el && row) row.scrollLeft = Math.max(0, el.offsetLeft - 64);
    // Once, on mount.
  }, []);

  return (
    <div
      role="group"
      aria-label={label}
      className="relative -mx-1 flex snap-x items-center gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:thin]"
      data-testid="date-day-strip"
    >
      {days.map(({ date, showMonth }) => {
        const selected = value != null && sameDay(date, value);
        return (
          <Fragment key={dayKey(date)}>
            {showMonth ? (
              <span aria-hidden className="shrink-0 px-1 text-xs font-semibold text-primary">
                {date.toLocaleDateString(locale, { month: 'short' }).replace('.', '').toUpperCase()}
              </span>
            ) : null}
            <button
              type="button"
              ref={selected ? selectedRef : undefined}
              onClick={() => onChange(date)}
              aria-pressed={selected}
              aria-label={date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              className={cn(
                'flex w-14 shrink-0 snap-start flex-col items-center gap-0.5 rounded-lg border py-2 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted/50',
              )}
              data-testid={`date-day-${dayKey(date)}`}
            >
              <span className={cn('text-xs', selected ? 'text-primary' : 'text-muted-foreground')}>
                {date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '')}
              </span>
              <span className="text-lg font-semibold tabular-nums">{date.getDate()}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
