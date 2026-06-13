import type { EventDraft, WizardStep } from './draft';
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

export const STEPS: WizardStep[] = [
  {
    key: 'step1',
    titleKey: 'step1Title',
    Component: Step1Group,
    isValid: () => true,
  },
  {
    key: 'step2',
    titleKey: 'step2Title',
    Component: Step2Type,
    isValid: (d: EventDraft) => Boolean(d.eventType),
  },
  {
    key: 'step3',
    titleKey: 'step3Title',
    Component: Step3Spec,
    isValid: (d: EventDraft) => Boolean(d.specification),
  },
  {
    key: 'step4',
    titleKey: 'step4Title',
    Component: Step4Scoring,
    isValid: (d: EventDraft) =>
      Boolean(d.scoringMode) &&
      (d.scoringMode === 'classic' || (d.scoringValue != null && d.scoringValue > 0)),
  },
  {
    key: 'step5',
    titleKey: 'step5Title',
    Component: Step5Location,
    isValid: () => true,
  },
  {
    key: 'step6',
    titleKey: 'step6Title',
    Component: Step6Courts,
    isValid: (d: EventDraft) => d.numCourts >= 1,
  },
  {
    key: 'step7',
    titleKey: 'step7Title',
    Component: Step7Schedule,
    isValid: (d: EventDraft) =>
      Boolean(d.startsAt) &&
      d.durationMinutes > 0 &&
      new Date(d.startsAt as string).getTime() > Date.now(),
  },
  {
    key: 'step8',
    titleKey: 'step8Title',
    Component: Step8Preferences,
    isValid: (d: EventDraft) =>
      !d.entranceFee.enabled ||
      (d.entranceFee.amount != null && d.entranceFee.amount > 0 && Boolean(d.entranceFee.method)),
  },
  {
    key: 'step9',
    titleKey: 'step9Title',
    Component: Step9Details,
    isValid: (d: EventDraft) => d.name.trim().length > 0,
  },
  {
    key: 'step10',
    titleKey: 'step10Title',
    Component: Step10Invite,
    isValid: () => true,
  },
];
