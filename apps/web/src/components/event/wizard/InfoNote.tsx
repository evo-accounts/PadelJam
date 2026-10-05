import { Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * An inline "good to know" box inside a wizard step — the manual venue's "this event only" note,
 * the "selecting courts does not book them" note. It stays next to what it explains; the icon is
 * decorative. `warning` is a consequence to weigh (a private event leaves the group ranking) or
 * something to fix before creating (guests that no longer fit) — announced as a status.
 */
export function InfoNote({
  id,
  text,
  testId,
  tone = 'info',
}: {
  /** Lets a dialog point `aria-describedby` at the note it shows. */
  id?: string;
  text: string;
  testId?: string;
  tone?: 'info' | 'warning';
}) {
  const Icon = tone === 'warning' ? TriangleAlert : Info;
  return (
    <div
      role={tone === 'warning' ? 'status' : undefined}
      className={cn(
        'flex items-start gap-2 rounded-lg p-3 text-sm',
        tone === 'warning' ? 'bg-warning text-warning-foreground' : 'bg-muted',
      )}
      data-testid={testId}
    >
      <Icon
        className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' ? undefined : 'text-muted-foreground')}
        aria-hidden
      />
      <p id={id}>{text}</p>
    </div>
  );
}
