'use client';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * A stack of radio cards — Export's Download / Email and Cancel's scope (UX-MEVT-19/21), web's twin
 * of mobile's `RadioCardGroup`. One tab stop; the arrow keys move and select.
 */
export function RadioCards<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: { value: T; title: string }[];
  value: T;
  onChange: (v: T) => void;
  testId: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2" data-testid={testId}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
            )}
            data-testid={`${testId}-${o.value}`}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full border',
                checked ? 'border-primary' : 'border-muted-foreground',
              )}
            >
              {checked ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            <span className="font-medium">{o.title}</span>
          </button>
        );
      })}
    </div>
  );
}
