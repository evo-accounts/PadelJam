'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { formatDistanceKm } from '@padel/api';
import { cn } from '@/lib/utils';

export type CardOrientation = 'vertical' | 'horizontal';

/** The `t` of a `useT(...)` call, narrowed to what these helpers use. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The frame every Explore card shares (UX-GLOB-04, UX-GLOB-09), in its two arrangements:
 *
 *   - `vertical`: the fixed-width card of a rail on the Explore feed (UX-EXPL-01) — media on top,
 *     then the title and meta lines, and the action across the bottom.
 *   - `horizontal`: the full-width row of a See-all list (UX-EXPL-03) — media on the left, text
 *     in the middle, the action on the right.
 *
 * The whole card opens the entity, but the action is a sibling control, never nested in the link
 * (a button inside an anchor navigates on every press). The title's link is stretched over the
 * card with `after:inset-0`, and the action sits above it.
 */
export function ExploreCard({
  orientation,
  href,
  title,
  media,
  meta,
  action,
  testId,
}: {
  orientation: CardOrientation;
  href: string;
  title: string;
  media: ReactNode;
  /** Secondary lines under the title; falsy entries are skipped. */
  meta: ReactNode[];
  action: ReactNode;
  testId: string;
}) {
  const lines = meta.filter(Boolean);
  const titleLink = (
    <Link
      href={href}
      className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
      data-testid={`${testId}-link`}
    >
      {title}
    </Link>
  );

  if (orientation === 'vertical') {
    return (
      <div
        className="relative flex w-44 shrink-0 snap-start flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center shadow-sm transition-shadow hover:shadow-md has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50"
        data-testid={testId}
      >
        {media}
        <span className="line-clamp-2 w-full text-sm font-medium">{titleLink}</span>
        {lines.map((line, i) => (
          <span key={i} className="w-full truncate text-xs text-muted-foreground">
            {line}
          </span>
        ))}
        <div className="relative z-10 mt-auto w-full pt-1">{action}</div>
      </div>
    );
  }

  return (
    <div
      className="relative flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50 has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50"
      data-testid={testId}
    >
      {media}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{titleLink}</span>
        {lines.map((line, i) => (
          <span key={i} className="truncate text-xs text-muted-foreground">
            {line}
          </span>
        ))}
      </div>
      <div className="relative z-10 shrink-0">{action}</div>
    </div>
  );
}

/** "Nearby" under a kilometre, then `formatDistanceKm`; nothing when either side has no point. */
export function distanceLabel(t: Translate, metres: number | null | undefined): string | null {
  if (metres == null) return null;
  if (metres < 1000) return t('distanceNear');
  return t('distanceKm', { km: formatDistanceKm(metres) });
}

/** The copy for a failed card action: the RPC's error code when there is a line for it. */
export function actionErrorText(t: Translate, e: unknown): string {
  const code = e instanceof Error ? e.message : 'unknown_error';
  return t(code, { defaultValue: t('unknown_error') });
}

/**
 * The class a resolved action wears (Following, Requested, Joined). It is disabled — the card
 * offers no undo, D9 — but must read as a state, not as a greyed-out button.
 */
export const RESOLVED = 'disabled:opacity-100';

export const actionWidth = (orientation: CardOrientation) => cn(orientation === 'vertical' ? 'w-full' : 'min-w-24');
