'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { SCORING_MODES } from '@padel/api';
import {
  CUSTOM_POINTS_MAX,
  isPreset,
  MINUTES_MAX,
  MINUTES_MIN,
  parseCustomPoints,
  POINTS_PRESETS,
  scoringDefault,
} from '@padel/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { StepProps } from '../types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Scoring (UX-CEVT-05, B16). Three collapsed cards; selecting one expands it in place and
 * collapses the others, and the value it needs is set INSIDE the card. Points: presets 8–40 with
 * 32 selected, plus Custom (1–99) in a dialog. Time: a slider, 1–90 minutes, default 10. Classic
 * sets: selection only.
 *
 * A multi-value step, so the wizard keeps its fixed primary button; that button validates on tap
 * (UX-GLOB-06) and `flagged` outlines the cards here until a choice is made.
 */
export function Step4Scoring({ draft, patch, flagged }: StepProps) {
  const { t } = useT('event');
  const [customOpen, setCustomOpen] = useState(false);
  const hasCustom = draft.scoringValue != null && !isPreset(draft.scoringValue);

  const select = (mode: string) => {
    // Re-selecting the open card keeps its value; switching starts the new mode at its default.
    if (draft.scoringMode === mode) return;
    patch({ scoringMode: mode, scoringValue: scoringDefault(mode) });
  };

  return (
    <div className="flex flex-col gap-3" role="radiogroup" aria-label={t('step4Title')}>
      {SCORING_MODES.map((mode) => {
        const selected = draft.scoringMode === mode;
        const minutes = draft.scoringValue ?? MINUTES_MIN;
        return (
          <div
            key={mode}
            className={cn(
              'rounded-lg border transition-colors',
              selected ? 'border-primary bg-primary/5' : 'border-border',
              flagged && !selected && 'border-destructive',
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => select(mode)}
              className="flex w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid={`scoring-${mode}`}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                  selected ? 'border-primary' : 'border-border',
                )}
              >
                {selected ? <span className="size-2.5 rounded-full bg-primary" /> : null}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t(`scoring${cap(mode)}Label`)}</span>
                <span className="text-sm text-muted-foreground">{t(`scoring${cap(mode)}Desc`)}</span>
              </span>
            </button>

            {selected && mode === 'points' ? (
              <div className="flex flex-col gap-3 px-4 pb-4">
                <span className="text-sm font-medium">{t('pointsValueLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {POINTS_PRESETS.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      size="sm"
                      variant={draft.scoringValue === n ? 'default' : 'outline'}
                      aria-pressed={draft.scoringValue === n}
                      onClick={() => patch({ scoringValue: n })}
                      className="min-w-11 rounded-full"
                    >
                      {n}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant={hasCustom ? 'default' : 'outline'}
                    aria-pressed={hasCustom}
                    onClick={() => setCustomOpen(true)}
                    className="rounded-full"
                    data-testid="scoring-points-custom"
                  >
                    {hasCustom ? t('scoringCustomValue', { value: draft.scoringValue }) : t('scoringCustom')}
                  </Button>
                </div>
              </div>
            ) : null}

            {selected && mode === 'time' ? (
              <div className="flex flex-col gap-3 px-4 pb-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="scoring-time-slider" className="text-sm font-medium">
                    {t('timeValueLabel')}
                  </label>
                  <span className="font-semibold tabular-nums">{t('minutesValue', { count: minutes })}</span>
                </div>
                <input
                  id="scoring-time-slider"
                  type="range"
                  min={MINUTES_MIN}
                  max={MINUTES_MAX}
                  step={1}
                  value={minutes}
                  aria-valuetext={t('minutesValue', { count: minutes })}
                  onChange={(e) => patch({ scoringValue: Number(e.target.value) })}
                  className="w-full accent-primary"
                  data-testid="scoring-time-slider"
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <CustomPointsDialog
        open={customOpen}
        initial={hasCustom ? draft.scoringValue : null}
        onClose={() => setCustomOpen(false)}
        onSave={(n) => {
          patch({ scoringValue: n });
          setCustomOpen(false);
        }}
      />
    </div>
  );
}

/**
 * Custom points: a centred numeric input and Save. Validated on Save, never a disabled button
 * (UX-GLOB-06). Mounted fresh each time it opens, so it starts from the current custom value.
 */
function CustomPointsDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: number | null;
  onClose: () => void;
  onSave: (n: number) => void;
}) {
  const { t } = useT('event');
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-sm" data-testid="custom-points-dialog">
        {open ? <CustomPointsForm initial={initial} onSave={onSave} t={t} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CustomPointsForm({
  initial,
  onSave,
  t,
}: {
  initial: number | null;
  onSave: (n: number) => void;
  t: (key: string) => string;
}) {
  const [text, setText] = useState(initial != null ? String(initial) : '');
  const [invalid, setInvalid] = useState(false);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseCustomPoints(text);
    if (n == null) {
      setInvalid(true);
      return;
    }
    onSave(n);
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{t('customPointsTitle')}</DialogTitle>
        <DialogDescription id="custom-points-hint" className={cn(invalid && 'text-destructive')}>
          {invalid ? t('customPointsError') : t('customPointsHint')}
        </DialogDescription>
      </DialogHeader>
      <Input
        autoFocus
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={String(CUSTOM_POINTS_MAX).length}
        value={text}
        onChange={(e) => {
          setText(e.target.value.replace(/[^0-9]/g, '').slice(0, String(CUSTOM_POINTS_MAX).length));
          setInvalid(false);
        }}
        aria-label={t('customPointsTitle')}
        aria-invalid={invalid}
        aria-describedby="custom-points-hint"
        className="mx-auto h-14 w-28 text-center text-2xl font-semibold"
        data-testid="custom-points-input"
      />
      <Button type="submit" className="w-full" data-testid="custom-points-save">
        {t('customPointsSave')}
      </Button>
    </form>
  );
}
