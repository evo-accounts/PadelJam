/**
 * The ring geometry behind `Donut` (UX-MEVT-03). RN-free so it is unit-testable: the filled arc is
 * a stroked circle whose dash covers `fraction` of the circumference, starting at 12 o'clock.
 */
export type DonutArc = {
  /** 0..1, clamped; 0 when there is nothing to count (total 0). */
  fraction: number;
  /** Radius of the stroke's centre line, so the ring fits inside `size`. */
  r: number;
  circumference: number;
  /** `strokeDashoffset` for the filled arc: the unfilled remainder of the circumference. */
  dashOffset: number;
};

export function donutArc(value: number, total: number, size: number, stroke: number): DonutArc {
  const raw = total > 0 && Number.isFinite(value) ? value / total : 0;
  const fraction = Math.min(1, Math.max(0, raw));
  const r = Math.max(0, (size - stroke) / 2);
  const circumference = 2 * Math.PI * r;
  return { fraction, r, circumference, dashOffset: circumference * (1 - fraction) };
}
