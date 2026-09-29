import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The ring geometry: the filled arc is a stroked circle whose dash covers `fraction` of the
 * circumference, starting at 12 o'clock. Same maths as mobile's `donutArc`.
 */
export function donutArc(value: number, total: number, size: number, stroke: number) {
  const raw = total > 0 && Number.isFinite(value) ? value / total : 0;
  const fraction = Math.min(1, Math.max(0, raw));
  const r = Math.max(0, (size - stroke) / 2);
  const circumference = 2 * Math.PI * r;
  return { fraction, r, circumference, dashOffset: circumference * (1 - fraction) };
}

const STROKE_RATIO = 0.14;

/**
 * Donut — a ring filled to `value / total`, with the ratio in its centre (UX-MEVT-03: the Manage
 * Event dashboard's Confirmed and Paid cards). Web's twin of mobile's `Donut`: a muted track and a
 * primary arc, as inline SVG.
 *
 * One accessible element: a `progressbar` named by `label` and valued with the ratio. Inside a link
 * or button that already names the ratio, pass `decorative` so it is hidden from assistive tech.
 */
export function Donut({
  value,
  total,
  label,
  size = 72,
  decorative = false,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  value: number;
  total: number;
  /** Names the chart ("Confirmed", "Paid"). */
  label: string;
  /** Outer diameter in px. */
  size?: number;
  decorative?: boolean;
}) {
  const stroke = Math.max(4, Math.round(size * STROKE_RATIO));
  const arc = donutArc(value, total, size, stroke);
  const c = size / 2;
  const ratio = `${value}/${total}`;
  const max = Math.max(total, 0);
  return (
    <div
      data-slot="donut"
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      {...(decorative
        ? { 'aria-hidden': true }
        : {
            role: 'progressbar',
            'aria-label': label,
            'aria-valuemin': 0,
            'aria-valuemax': max,
            'aria-valuenow': Math.min(value, max),
            'aria-valuetext': ratio,
          })}
      {...props}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={c} cy={c} r={arc.r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        {arc.fraction > 0 ? (
          <circle
            cx={c}
            cy={c}
            r={arc.r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-primary"
            strokeLinecap={arc.fraction < 1 ? 'round' : 'butt'}
            strokeDasharray={`${arc.circumference} ${arc.circumference}`}
            strokeDashoffset={arc.dashOffset}
            // Start at 12 o'clock rather than 3.
            transform={`rotate(-90 ${c} ${c})`}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
        {ratio}
      </span>
    </div>
  );
}
