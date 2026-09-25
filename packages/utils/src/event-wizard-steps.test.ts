import { describe, expect, it } from 'vitest';

import { defaultWizardDraft as defaultDraft, type WizardDraft as EventDraft } from './event-wizard';
import {
  isManualVenue,
  neighbourStep,
  STEP_KEYS,
  stepProgress,
  visibleStepKeys,
} from './event-wizard-steps';

const standalone: EventDraft = { ...defaultDraft, groupId: null, isPrivate: true };
const publicGroup: EventDraft = { ...defaultDraft, groupId: 'g1', isPrivate: false };
const privateGroup: EventDraft = { ...defaultDraft, groupId: 'g1', isPrivate: true };
const registryVenue = { hasLocation: true, venueId: 'v1' };
const manualVenue = { hasLocation: true, venueId: undefined, manualLocationName: 'Clube X' };

describe('visibleStepKeys (UX-CEVT-01)', () => {
  it('walks all ten steps for a private event at a registry venue', () => {
    expect(visibleStepKeys({ ...privateGroup, ...registryVenue })).toEqual([...STEP_KEYS]);
    expect(visibleStepKeys({ ...standalone, ...registryVenue })).toEqual([...STEP_KEYS]);
  });

  it('keeps Courts when there is no location at all', () => {
    expect(visibleStepKeys(standalone)).toContain('courts');
  });

  it('skips Courts for a manually added venue', () => {
    expect(isManualVenue(manualVenue)).toBe(true);
    expect(visibleStepKeys({ ...standalone, ...manualVenue })).not.toContain('courts');
    expect(visibleStepKeys({ ...standalone, ...manualVenue })).toHaveLength(9);
  });

  it('skips Invite players for a public group event only', () => {
    expect(visibleStepKeys(publicGroup)).not.toContain('invite');
    expect(visibleStepKeys(privateGroup)).toContain('invite');
    expect(visibleStepKeys(standalone)).toContain('invite');
  });

  it('skips both on a public group event at a manual venue', () => {
    const keys = visibleStepKeys({ ...publicGroup, ...manualVenue });
    expect(keys).toHaveLength(8);
    expect(keys[keys.length - 1]).toBe('details');
  });
});

describe('neighbourStep', () => {
  it('steps over a hidden step in both directions', () => {
    const d = { ...standalone, ...manualVenue };
    expect(neighbourStep(d, 'location', 1)).toBe('date');
    expect(neighbourStep(d, 'date', -1)).toBe('location');
  });

  it('stays put at either end', () => {
    expect(neighbourStep(standalone, 'group', -1)).toBe('group');
    expect(neighbourStep(standalone, 'invite', 1)).toBe('invite');
    expect(neighbourStep(publicGroup, 'details', 1)).toBe('details');
  });

  it('moves the right way from a step the draft just hid', () => {
    const d = { ...standalone, ...manualVenue };
    expect(neighbourStep(d, 'courts', 1)).toBe('date');
    expect(neighbourStep(d, 'courts', -1)).toBe('location');
  });
});

describe('stepProgress', () => {
  it('is index / visible count', () => {
    expect(stepProgress(standalone, 'group')).toBe(0);
    expect(stepProgress(standalone, 'scoring')).toBeCloseTo(3 / 10);
    expect(stepProgress(publicGroup, 'details')).toBeCloseTo(8 / 9);
  });

  it('is 0 for a step that is not on the path', () => {
    expect(stepProgress(publicGroup, 'invite')).toBe(0);
  });
});
