import { describe, it, expect } from 'vitest';
import { stepIsValid, draftToCreateInput, defaultWizardDraft, splitWizardInvitees, courtsReserved, type WizardDraft } from './event-wizard';

const HOUR = 60 * 60 * 1000;
const full = (over: Partial<WizardDraft> = {}): WizardDraft => ({
  ...defaultWizardDraft,
  groupId: 'g1',
  eventType: 'americano',
  specification: 'classic',
  scoringMode: 'points',
  scoringValue: 24,
  startsAt: new Date(100 * HOUR).toISOString(),
  name: 'Friday Padel',
  ...over,
});

describe('stepIsValid', () => {
  it('step2/3 require type/spec', () => {
    expect(stepIsValid[2](defaultWizardDraft, 0)).toBe(false);
    expect(stepIsValid[2](full(), 0)).toBe(true);
    expect(stepIsValid[3](full({ specification: undefined }), 0)).toBe(false);
  });
  it('step4 needs a positive value unless classic', () => {
    expect(stepIsValid[4](full({ scoringMode: 'points', scoringValue: 0 }), 0)).toBe(false);
    expect(stepIsValid[4](full({ scoringMode: 'classic', scoringValue: null }), 0)).toBe(true);
  });
  it('step4 keeps Points to 1–99 and Time to 1–90 minutes (decision 9)', () => {
    expect(stepIsValid[4](full({ scoringMode: 'points', scoringValue: 99 }), 0)).toBe(true);
    expect(stepIsValid[4](full({ scoringMode: 'points', scoringValue: 100 }), 0)).toBe(false);
    expect(stepIsValid[4](full({ scoringMode: 'points', scoringValue: 2.5 }), 0)).toBe(false);
    expect(stepIsValid[4](full({ scoringMode: 'time', scoringValue: 90 }), 0)).toBe(true);
    expect(stepIsValid[4](full({ scoringMode: 'time', scoringValue: 91 }), 0)).toBe(false);
    expect(stepIsValid[4](full({ scoringMode: 'time', scoringValue: null }), 0)).toBe(false);
  });
  it('step7 requires a future start', () => {
    expect(stepIsValid[7](full({ startsAt: new Date(100 * HOUR).toISOString() }), 50 * HOUR)).toBe(true);
    expect(stepIsValid[7](full({ startsAt: new Date(10 * HOUR).toISOString() }), 50 * HOUR)).toBe(false);
  });
  it('step8 requires amount+method when fee enabled', () => {
    expect(stepIsValid[8](full({ entranceFee: { enabled: true } }), 0)).toBe(false);
    expect(stepIsValid[8](full({ entranceFee: { enabled: true, amount: 5, method: 'cash' } }), 0)).toBe(true);
  });
  it('step9 requires a name', () => {
    expect(stepIsValid[9](full({ name: '  ' }), 0)).toBe(false);
  });
});

describe('draftToCreateInput', () => {
  it('forces isPrivate for standalone (no group)', () => {
    const out = draftToCreateInput(full({ groupId: null, isPrivate: false }));
    expect(out.isPrivate).toBe(true);
  });
  it('nulls scoringValue for classic and drops fee fields when disabled', () => {
    const out = draftToCreateInput(full({ scoringMode: 'classic', scoringValue: 9 }));
    expect(out.scoringValue).toBeNull();
    expect((out.entranceFee as { amount?: number }).amount).toBeUndefined();
  });
  it('passes the thumbnail path through', () => {
    expect(draftToCreateInput(full(), 'evt/x.jpg').thumbnailPath).toBe('evt/x.jpg');
  });
});

describe('splitWizardInvitees (0113 interim bridge)', () => {
  it('keeps platform users as invitations and turns named manual entries into guests', () => {
    expect(
      splitWizardInvitees([
        { invitee_id: '22222222-2222-2222-2222-222222222222' },
        { name: ' Rui ', gender: 'male' },
        { name: 'Ana' },
        { name: '' },
      ]),
    ).toEqual({
      invitees: [{ invitee_id: '22222222-2222-2222-2222-222222222222' }],
      guests: [{ name: 'Rui', gender: 'male' }, { name: 'Ana' }],
    });
    expect(splitWizardInvitees(undefined)).toEqual({ invitees: undefined, guests: undefined });
  });
});

describe('courtsReserved', () => {
  it('is false only for a registry venue with no court ticked ("Have not reserved yet")', () => {
    expect(courtsReserved({ venueId: 'v', courtIds: undefined })).toBe(false);
    expect(courtsReserved({ venueId: 'v', courtIds: [] })).toBe(false);
    expect(courtsReserved({ venueId: 'v', courtIds: ['c'] })).toBe(true);
    expect(courtsReserved({ venueId: undefined })).toBe(true);
    expect(courtsReserved({ venueId: null, courtIds: undefined })).toBe(true);
  });
});
