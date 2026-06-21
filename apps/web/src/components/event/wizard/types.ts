import type { WizardDraft } from '@padel/utils';
export interface StepProps {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
  communityId: string;
}
