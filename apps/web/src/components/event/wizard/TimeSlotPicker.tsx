'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { DAY_PERIODS, type DayPeriod, isPastSlot, periodOf, timeSlots } from '@padel/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const PERIOD_KEY: Record<DayPeriod, string> = {
  morning: 'periodMorning',
  afternoon: 'periodAfternoon',
  evening: 'periodEvening',
};

/**
 * The Time card (UX-CEVT-08): Morning / Afternoon / Evening tabs, each revealing its half-hourly
 * start times as a grid. Picking a time is one click — no steppers. On today, times already gone
 * are shown but not pickable. Opens on the tab holding the current start.
 *
 * testIDs: tabs `time-period-{period}`, slots `time-slot-HH:MM`.
 */
export function TimeSlotPicker({
  day,
  value,
  onChange,
  now,
}: {
  /** The picked day — decides which slots are past. */
  day: Date;
  /** 'HH:MM', or null when no time is picked. */
  value: string | null;
  onChange: (hhmm: string) => void;
  now: Date;
}) {
  const { t } = useT('event');
  const valuePeriod = value ? periodOf(value) : null;
  const [period, setPeriod] = useState<DayPeriod>(valuePeriod ?? 'evening');
  // Follow the value when it moves to another period from outside (a day change that snapped the
  // start to the first free slot); a tab the user opened stays open until then.
  const [syncedPeriod, setSyncedPeriod] = useState(valuePeriod);
  if (valuePeriod !== syncedPeriod) {
    setSyncedPeriod(valuePeriod);
    if (valuePeriod) setPeriod(valuePeriod);
  }

  return (
    <Tabs value={period} onValueChange={(v) => setPeriod(v as DayPeriod)} className="gap-3">
      <TabsList className="w-full" aria-label={t('timeLabel')}>
        {DAY_PERIODS.map((p) => (
          <TabsTrigger key={p} value={p} data-testid={`time-period-${p}`}>
            {t(PERIOD_KEY[p])}
          </TabsTrigger>
        ))}
      </TabsList>
      {DAY_PERIODS.map((p) => (
        <TabsContent key={p} value={p}>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {timeSlots(p).map((slot) => {
              const selected = slot === value;
              const past = isPastSlot(day, slot, now);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onChange(slot)}
                  disabled={past}
                  aria-pressed={selected}
                  className={cn(
                    'min-h-10 rounded-full border text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:bg-muted/50',
                  )}
                  data-testid={`time-slot-${slot}`}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
