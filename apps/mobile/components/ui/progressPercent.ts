/** 0..1 → a whole percentage, clamped. RN-free so it is unit-testable (see ProgressBar). */
export function percentOf(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}
