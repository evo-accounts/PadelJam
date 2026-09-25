import { describe, expect, it } from 'vitest';

import { defaultDraft, type EventDraft } from './draft';
import {
  validateStep1,
  validateStep10,
  validateStep2,
  validateStep3,
  validateStep4,
  validateStep5,
  validateStep6,
  validateStep7,
  validateStep8,
  validateStep9,
} from './stepValidators';

const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('wizard step validators', () => {
  it('step1/5/10 never block (no required fields)', () => {
    expect(validateStep1(defaultDraft)).toEqual([]);
    expect(validateStep5(defaultDraft)).toEqual([]);
    expect(validateStep10(defaultDraft)).toEqual([]);
  });

  it('step2 requires an event type', () => {
    expect(validateStep2(defaultDraft)).toEqual(['eventType']);
    expect(validateStep2({ ...defaultDraft, eventType: 'americano' })).toEqual([]);
  });

  it('step3 requires a specification', () => {
    expect(validateStep3(defaultDraft)).toEqual(['specification']);
    expect(validateStep3({ ...defaultDraft, specification: 'classic' })).toEqual([]);
  });

  it('step4 requires a scoring mode, and a positive value unless classic', () => {
    expect(validateStep4(defaultDraft)).toEqual(['scoringMode']);
    expect(validateStep4({ ...defaultDraft, scoringMode: 'classic' })).toEqual([]);
    expect(validateStep4({ ...defaultDraft, scoringMode: 'points', scoringValue: null })).toEqual(['scoringValue']);
    expect(validateStep4({ ...defaultDraft, scoringMode: 'points', scoringValue: 24 })).toEqual([]);
  });

  it('step4 holds points to 1–99 and minutes to 1–90 (decision 9)', () => {
    const points = (v: number) => validateStep4({ ...defaultDraft, scoringMode: 'points', scoringValue: v });
    const time = (v: number) => validateStep4({ ...defaultDraft, scoringMode: 'time', scoringValue: v });
    expect(points(0)).toEqual(['scoringValue']);
    expect(points(1)).toEqual([]);
    expect(points(99)).toEqual([]);
    expect(points(100)).toEqual(['scoringValue']);
    expect(time(0)).toEqual(['scoringValue']);
    expect(time(90)).toEqual([]);
    expect(time(91)).toEqual(['scoringValue']);
  });

  it('step6 requires at least one court', () => {
    expect(validateStep6({ ...defaultDraft, numCourts: 0 })).toEqual(['numCourts']);
    expect(validateStep6({ ...defaultDraft, numCourts: 1 })).toEqual([]);
  });

  it('step7 requires a future start time and a positive duration', () => {
    expect(validateStep7(defaultDraft)).toEqual(['startsAt']);
    expect(validateStep7({ ...defaultDraft, startsAt: past, durationMinutes: 90 })).toEqual(['startsAt']);
    expect(validateStep7({ ...defaultDraft, startsAt: future, durationMinutes: 0 })).toEqual(['durationMinutes']);
    expect(validateStep7({ ...defaultDraft, startsAt: future, durationMinutes: 90 })).toEqual([]);
  });

  it('step8 only validates the fee fields when the fee is enabled', () => {
    expect(validateStep8(defaultDraft)).toEqual([]);
    const enabled: EventDraft = { ...defaultDraft, entranceFee: { enabled: true } };
    expect(validateStep8(enabled)).toEqual(['feeAmount', 'feeMethod']);
    expect(
      validateStep8({ ...defaultDraft, entranceFee: { enabled: true, amount: 5, method: 'cash' } }),
    ).toEqual([]);
  });

  it('step9 requires a non-blank name', () => {
    expect(validateStep9({ ...defaultDraft, name: '' })).toEqual(['name']);
    expect(validateStep9({ ...defaultDraft, name: '   ' })).toEqual(['name']);
    expect(validateStep9({ ...defaultDraft, name: 'Sunday Americano' })).toEqual([]);
  });
});
