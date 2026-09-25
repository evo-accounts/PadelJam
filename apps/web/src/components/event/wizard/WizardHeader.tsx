'use client';
import { ArrowLeft, X } from 'lucide-react';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';

/**
 * The create-event wizard's chrome (UX-CEVT-01): ← on the left (absent on the first step, where
 * there is nothing to go back to), ✕ on the right, and a progress bar across the width with its
 * percentage on the same line. The bar follows the path THIS draft walks, so its step count is
 * not fixed — "Step N of 10" is gone with it.
 */
export function WizardHeader({
  title,
  progress,
  onBack,
  onClose,
}: {
  title: string;
  /** 0..1 */
  progress: number;
  onBack?: () => void;
  onClose: () => void;
}) {
  const { t: tc } = useT('common');
  const percent = Math.round(Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)) * 100);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {/* Holds its place when absent, so the title does not jump on the first step. */}
        <div className="size-9 shrink-0">
          {onBack ? (
            <Button variant="ghost" size="icon" aria-label={tc('back')} onClick={onBack} data-testid="event-wizard-back">
              <ArrowLeft />
            </Button>
          ) : null}
        </div>
        <p className="flex-1 truncate text-center text-sm font-medium text-muted-foreground">{title}</p>
        <Button variant="ghost" size="icon" aria-label={tc('close')} onClick={onClose} data-testid="event-wizard-close">
          <X />
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={tc('progress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          data-testid="event-wizard-progress"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-10 text-right text-xs font-medium tabular-nums text-muted-foreground">{percent}%</span>
      </div>
    </div>
  );
}
