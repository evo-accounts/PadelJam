'use client';
import { cn } from '@/lib/utils';

export function SelectableCard({
  title,
  subtitle,
  selected,
  onClick,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-start gap-0.5 rounded-lg border p-4 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
      )}
    >
      <span className="font-medium">{title}</span>
      {subtitle ? <span className="text-sm text-muted-foreground">{subtitle}</span> : null}
    </button>
  );
}
