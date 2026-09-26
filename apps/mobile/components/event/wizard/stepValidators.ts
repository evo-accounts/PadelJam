import {
  COURTS_MAX,
  COURTS_MIN,
  CUSTOM_POINTS_MAX,
  CUSTOM_POINTS_MIN,
  DURATION_MAX,
  DURATION_MIN,
  MINUTES_MAX,
  MINUTES_MIN,
} from '@padel/utils';

import type { EventDraft } from './draft';

/**
 * Pure per-step validators (UX-GLOB-06). Each returns the failing field keys for
 * that step, `[]` when the step is complete. Kept in their own RN-free module so
 * they're unit-testable without pulling in the step components' React Native
 * imports — `steps.tsx` wires these into each `WizardStep.validate`, and
 * `WizardStep.isValid` is derived as `validate(d).length === 0`.
 */

export const validateStep1 = (_d: EventDraft): string[] => [];

export const validateStep2 = (d: EventDraft): string[] => (d.eventType ? [] : ['eventType']);

export const validateStep3 = (d: EventDraft): string[] => (d.specification ? [] : ['specification']);

export function validateStep4(d: EventDraft): string[] {
  if (!d.scoringMode) return ['scoringMode'];
  if (d.scoringMode === 'classic') return [];
  const [min, max] =
    d.scoringMode === 'points' ? [CUSTOM_POINTS_MIN, CUSTOM_POINTS_MAX] : [MINUTES_MIN, MINUTES_MAX];
  const v = d.scoringValue;
  return v != null && Number.isInteger(v) && v >= min && v <= max ? [] : ['scoringValue'];
}

const courtsInRange = (n: number) => Number.isInteger(n) && n >= COURTS_MIN && n <= COURTS_MAX;

/**
 * Location only validates the manual venue form — the registry list and "no location" advance on
 * the tap. A manual venue needs an address (its name is optional) and 1–20 courts.
 */
export function validateStep5(d: EventDraft): string[] {
  if (d.locationMode !== 'manual') return [];
  const errors: string[] = [];
  if (!(d.manualLocationAddress ?? '').trim()) errors.push('manualLocationAddress');
  if (!courtsInRange(d.numCourts)) errors.push('numCourts');
  return errors;
}

/** Courts: a count in range, and — when picking a venue's courts — at least one ticked. */
export function validateStep6(d: EventDraft): string[] {
  if (d.courtIds && d.courtIds.length === 0) return ['courtIds'];
  return courtsInRange(d.numCourts) ? [] : ['numCourts'];
}

export function validateStep7(d: EventDraft): string[] {
  const errors: string[] = [];
  if (!d.startsAt || new Date(d.startsAt).getTime() <= Date.now()) errors.push('startsAt');
  const m = d.durationMinutes;
  if (!(Number.isInteger(m) && m >= DURATION_MIN && m <= DURATION_MAX)) errors.push('durationMinutes');
  return errors;
}

export function validateStep8(d: EventDraft): string[] {
  if (!d.entranceFee.enabled) return [];
  const errors: string[] = [];
  if (!(d.entranceFee.amount != null && d.entranceFee.amount > 0)) errors.push('feeAmount');
  if (!d.entranceFee.method) errors.push('feeMethod');
  return errors;
}

export const validateStep9 = (d: EventDraft): string[] => (d.name.trim().length > 0 ? [] : ['name']);

export const validateStep10 = (_d: EventDraft): string[] => [];
