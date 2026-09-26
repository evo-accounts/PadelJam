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
  it('step1/5/10 never block on an untouched draft', () => {
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

  it('step5 validates only the manual venue form: an address and 1–20 courts', () => {
    expect(validateStep5({ ...defaultDraft, locationMode: 'registry', venueId: 'v' })).toEqual([]);
    expect(validateStep5({ ...defaultDraft, locationMode: 'none' })).toEqual([]);
    const manual: EventDraft = { ...defaultDraft, locationMode: 'manual', hasLocation: true };
    expect(validateStep5(manual)).toEqual(['manualLocationAddress']);
    expect(validateStep5({ ...manual, manualLocationAddress: '   ' })).toEqual(['manualLocationAddress']);
    expect(validateStep5({ ...manual, manualLocationAddress: 'Rua A 1' })).toEqual([]);
    expect(validateStep5({ ...manual, manualLocationAddress: 'Rua A 1', numCourts: 21 })).toEqual(['numCourts']);
  });

  it('step6 requires 1–20 courts', () => {
    expect(validateStep6({ ...defaultDraft, numCourts: 0 })).toEqual(['numCourts']);
    expect(validateStep6({ ...defaultDraft, numCourts: 1 })).toEqual([]);
    expect(validateStep6({ ...defaultDraft, numCourts: 20 })).toEqual([]);
    expect(validateStep6({ ...defaultDraft, numCourts: 21 })).toEqual(['numCourts']);
  });

  it('step6 needs a ticked court once "Select courts" is chosen', () => {
    expect(validateStep6({ ...defaultDraft, courtIds: [] })).toEqual(['courtIds']);
    expect(validateStep6({ ...defaultDraft, courtIds: ['c1'] })).toEqual([]);
  });

  it('step7 holds a custom duration to 15–480 minutes (decision 9)', () => {
    const d = (m: number) => validateStep7({ ...defaultDraft, startsAt: future, durationMinutes: m });
    expect(d(14)).toEqual(['durationMinutes']);
    expect(d(15)).toEqual([]);
    expect(d(480)).toEqual([]);
    expect(d(481)).toEqual(['durationMinutes']);
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

  it('step8 checks the extra spots (1–20) only while stand-by is on', () => {
    expect(validateStep8({ ...defaultDraft, allowStandby: false, standbySpots: 99 })).toEqual([]);
    expect(validateStep8({ ...defaultDraft, allowStandby: true, standbySpots: 4 })).toEqual([]);
    expect(validateStep8({ ...defaultDraft, allowStandby: true, standbySpots: 21 })).toEqual(['standbySpots']);
    expect(validateStep8({ ...defaultDraft, allowStandby: true, standbySpots: undefined })).toEqual(['standbySpots']);
  });

  it('step8 wants the MB WAY number when MB WAY is the method', () => {
    const mba: EventDraft = { ...defaultDraft, entranceFee: { enabled: true, amount: 5, method: 'mba' } };
    expect(validateStep8(mba)).toEqual(['feeMbaNumber']);
    expect(validateStep8({ ...mba, entranceFee: { ...mba.entranceFee, mbaNumber: '912345678' } })).toEqual([]);
  });

  it('step10 flags guests that no longer fit (courts lowered after adding them)', () => {
    const guests = Array.from({ length: 4 }, (_, i) => ({ key: String(i), name: `G${i}` }));
    const d: EventDraft = { ...defaultDraft, specification: 'classic', numCourts: 1, guests };
    // 4 spots: the playing organizer + 4 guests is one too many.
    expect(validateStep10(d)).toEqual(['guests']);
    expect(validateStep10({ ...d, organizerRole: 'organizing_only' })).toEqual([]);
  });

  it('step10 checks a mixed event per gender, counting the organizer', () => {
    const d: EventDraft = {
      ...defaultDraft,
      specification: 'mixed',
      numCourts: 1,
      guests: [
        { key: 'a', name: 'A', gender: 'male' },
        { key: 'b', name: 'B', gender: 'male' },
      ],
    };
    expect(validateStep10(d, { organizerGender: 'female' })).toEqual([]);
    expect(validateStep10(d, { organizerGender: 'male' })).toEqual(['guests']);
  });

  it('step9 requires a non-blank name', () => {
    expect(validateStep9({ ...defaultDraft, name: '' })).toEqual(['name']);
    expect(validateStep9({ ...defaultDraft, name: '   ' })).toEqual(['name']);
    expect(validateStep9({ ...defaultDraft, name: 'Sunday Americano' })).toEqual([]);
  });
});
