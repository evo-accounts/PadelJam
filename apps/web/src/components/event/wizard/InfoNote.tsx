import { Info } from 'lucide-react';

/**
 * An inline "good to know" box inside a wizard step — the manual venue's "this event only" note,
 * the "selecting courts does not book them" note. It stays next to what it explains; the icon is
 * decorative.
 */
export function InfoNote({ text, testId }: { text: string; testId?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm" data-testid={testId}>
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p>{text}</p>
    </div>
  );
}
