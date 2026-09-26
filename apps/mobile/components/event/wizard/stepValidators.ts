import type { EventDraft } from './draft';
import { CUSTOM_POINTS_MAX, CUSTOM_POINTS_MIN, MINUTES_MAX, MINUTES_MIN } from './scoring';

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

export const validateStep5 = (_d: EventDraft): string[] => [];

export const validateStep6 = (d: EventDraft): string[] => (d.numCourts >= 1 ? [] : ['numCourts']);

export function validateStep7(d: EventDraft): string[] {
  const errors: string[] = [];
  if (!d.startsAt || new Date(d.startsAt).getTime() <= Date.now()) errors.push('startsAt');
  if (!(d.durationMinutes > 0)) errors.push('durationMinutes');
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
