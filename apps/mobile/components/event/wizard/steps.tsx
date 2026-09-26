import type { WizardStep } from './draft';
import type { StepKey } from '@padel/utils';
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
import { NoGroupFooter, Step1Group } from './steps/Step1Group';
import { Step2Type } from './steps/Step2Type';
import { Step3Spec } from './steps/Step3Spec';
import { Step4Scoring } from './steps/Step4Scoring';
import { NoLocationFooter, Step5Location } from './steps/Step5Location';
import { Step6Courts } from './steps/Step6Courts';
import { DateSummaryFooter, Step7Schedule } from './steps/Step7Schedule';
import { Step8Preferences } from './steps/Step8Preferences';
import { Step9Details } from './steps/Step9Details';
import { Step10Invite } from './steps/Step10Invite';

/** Builds a `WizardStep` from a pure `validate`, deriving `isValid` so existing callers keep working. */
function step(
  key: StepKey,
  titleKey: string,
  Component: WizardStep['Component'],
  validate: WizardStep['validate'],
  advanceBy: WizardStep['advanceBy'] = 'button',
  Footer?: WizardStep['Footer'],
): WizardStep {
  return { key, titleKey, Component, validate, advanceBy, Footer, isValid: (d) => validate(d).length === 0 };
}

/**
 * Every step, in order. Which of them a given draft actually walks is `visibleStepKeys` — Courts
 * drops out for a manual venue, Invite players for a public group event (UX-CEVT-01).
 */
export const STEPS: WizardStep[] = [
  step('group', 'step1Title', Step1Group, validateStep1, 'tap', NoGroupFooter),
  step('format', 'step2Title', Step2Type, validateStep2, 'tap'),
  step('players', 'step3Title', Step3Spec, validateStep3, 'tap'),
  step('scoring', 'step4Title', Step4Scoring, validateStep4),
  // A tap list of venues until the manual venue form is opened, which has fields and a button.
  step('location', 'step5Title', Step5Location, validateStep5, (d) => (d.locationMode === 'manual' ? 'button' : 'tap'), NoLocationFooter),
  step('courts', 'step6Title', Step6Courts, validateStep6),
  step('date', 'step7Title', Step7Schedule, validateStep7, 'button', DateSummaryFooter),
  step('preferences', 'step8Title', Step8Preferences, validateStep8),
  step('details', 'step9Title', Step9Details, validateStep9),
  step('invite', 'step10Title', Step10Invite, validateStep10),
];

export function stepByKey(key: StepKey): WizardStep {
  return STEPS.find((s) => s.key === key)!;
}
