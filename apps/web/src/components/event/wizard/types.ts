import type { WizardDraft } from '@padel/utils';
export interface StepProps {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
  communityId: string;
  /**
   * Applies `partial` (if any) and moves to the next VISIBLE step in one update. A tap-to-advance
   * step (UX-CEVT-01) calls it from the card itself — the tap is the answer, so the step has no
   * primary button and leaves no selected state behind.
   */
  advance?: (partial?: Partial<WizardDraft>) => void;
  /** True once the fixed primary button was tapped on this step while it was incomplete (UX-GLOB-06). */
  flagged?: boolean;
}
