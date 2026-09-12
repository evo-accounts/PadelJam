import type { WizardStep } from './draft';
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
import { Step1Group } from './steps/Step1Group';
import { Step2Type } from './steps/Step2Type';
import { Step3Spec } from './steps/Step3Spec';
import { Step4Scoring } from './steps/Step4Scoring';
import { Step5Location } from './steps/Step5Location';
import { Step6Courts } from './steps/Step6Courts';
import { Step7Schedule } from './steps/Step7Schedule';
import { Step8Preferences } from './steps/Step8Preferences';
import { Step9Details } from './steps/Step9Details';
import { Step10Invite } from './steps/Step10Invite';

/** Builds a `WizardStep` from a pure `validate`, deriving `isValid` so existing callers keep working. */
function step(
  key: string,
  titleKey: string,
  Component: WizardStep['Component'],
  validate: WizardStep['validate'],
): WizardStep {
  return { key, titleKey, Component, validate, isValid: (d) => validate(d).length === 0 };
}

export const STEPS: WizardStep[] = [
  step('step1', 'step1Title', Step1Group, validateStep1),
  step('step2', 'step2Title', Step2Type, validateStep2),
  step('step3', 'step3Title', Step3Spec, validateStep3),
  step('step4', 'step4Title', Step4Scoring, validateStep4),
  step('step5', 'step5Title', Step5Location, validateStep5),
  step('step6', 'step6Title', Step6Courts, validateStep6),
  step('step7', 'step7Title', Step7Schedule, validateStep7),
  step('step8', 'step8Title', Step8Preferences, validateStep8),
  step('step9', 'step9Title', Step9Details, validateStep9),
  step('step10', 'step10Title', Step10Invite, validateStep10),
];
