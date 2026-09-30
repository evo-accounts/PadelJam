import { SEARCH_DISTANCE_STEPS_KM } from '@padel/api';

/**
 * The stops of the Filter sheet's distance control (D13): one per step, then "Any" (no limit).
 * Pure, so the arithmetic is tested without React Native.
 */
const STEPS = SEARCH_DISTANCE_STEPS_KM;
export const DISTANCE_STOPS = STEPS.length + 1;
/** The thumb's diameter; stops run thumb-centre to thumb-centre along the track. */
export const THUMB = 24;

/** The stop index for a value: a step's index, or the last stop for "no limit". */
export const stopOf = (km: number | null) => {
  if (km == null) return STEPS.length;
  const i = STEPS.indexOf(km as (typeof STEPS)[number]);
  return i < 0 ? STEPS.length : i;
};

/** The value for a stop index. */
export const kmAt = (index: number): number | null => (index >= STEPS.length ? null : (STEPS[index] ?? null));

/** The stop nearest `x` on a track `width` wide. */
export const stopAt = (x: number, width: number) => {
  const usable = Math.max(1, width - THUMB);
  const ratio = Math.min(1, Math.max(0, (x - THUMB / 2) / usable));
  return Math.round(ratio * (DISTANCE_STOPS - 1));
};
