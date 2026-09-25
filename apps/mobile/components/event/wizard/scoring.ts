import type { ScoringMode } from '@padel/api';

/** Decision 9 / UX-CEVT-05: the point presets, with 32 selected when Points is chosen. */
export const POINTS_PRESETS = [8, 11, 16, 21, 24, 32, 40] as const;
export const DEFAULT_POINTS = 32;
/** Custom points, typed in the Custom sheet. */
export const CUSTOM_POINTS_MIN = 1;
export const CUSTOM_POINTS_MAX = 99;

/** The Time slider. */
export const DEFAULT_MINUTES = 10;
export const MINUTES_MIN = 1;
export const MINUTES_MAX = 90;

/** The value a mode starts with when its card is selected (B16: was 24 points / 15 minutes). */
export function scoringDefault(mode: ScoringMode): number | null {
  if (mode === 'points') return DEFAULT_POINTS;
  if (mode === 'time') return DEFAULT_MINUTES;
  return null;
}

export function isPreset(value: number | null): boolean {
  return value != null && (POINTS_PRESETS as readonly number[]).includes(value);
}

/** The Custom sheet's input → a whole number in range, or null when it is not one. */
export function parseCustomPoints(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= CUSTOM_POINTS_MIN && n <= CUSTOM_POINTS_MAX ? n : null;
}

/** A slider position (0..1 along the track) → whole minutes, clamped. */
export function minutesAt(fraction: number, min = MINUTES_MIN, max = MINUTES_MAX): number {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  return Math.round(min + f * (max - min));
}
