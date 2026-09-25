'use client';
import { cn } from '@/lib/utils';

export function SelectableCard({
  title,
  subtitle,
  selected,
  onClick,
  testId,
}: {
  title: string;
  subtitle?: string;
  /** Omitted on a tap-to-advance step: the tap is the answer, so no selected state is left behind. */
  selected?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={cn(
        'flex w-full flex-col items-start gap-0.5 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
      )}
    >
      <span className="font-medium">{title}</span>
      {subtitle ? <span className="text-sm text-muted-foreground">{subtitle}</span> : null}
    </button>
  );
}
