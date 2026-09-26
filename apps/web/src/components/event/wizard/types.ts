import type { WizardDraft } from '@padel/utils';

/**
 * The web wizard's draft: the shared `WizardDraft` plus the Location/Courts answers mobile keeps
 * on its own `EventDraft` (UX-CEVT-06/07). Kept here rather than in `@padel/utils` so a web-only
 * change does not touch `packages/**`.
 */
export interface WebWizardDraft extends WizardDraft {
  /**
   * How the Location step was answered: a registry venue, a venue typed in for this event only,
   * or no location. Undefined until one is chosen — the step then opens on the registry list.
   */
  locationMode?: 'registry' | 'manual' | 'none';
  /** A manual venue's optional court names, one per court (blank = unnamed). */
  manualCourtNames?: string[];
  /** A registry venue's ticked courts ("Select courts"); undefined = "Have not reserved yet". */
  courtIds?: string[];
}

export interface StepProps {
  draft: WebWizardDraft;
  patch: (partial: Partial<WebWizardDraft>) => void;
  communityId: string;
  /**
   * Applies `partial` (if any) and moves to the next VISIBLE step in one update. A tap-to-advance
   * step (UX-CEVT-01) calls it from the card itself — the tap is the answer, so the step has no
   * primary button and leaves no selected state behind.
   */
  advance?: (partial?: Partial<WebWizardDraft>) => void;
  /** True once the fixed primary button was tapped on this step while it was incomplete (UX-GLOB-06). */
  flagged?: boolean;
  /** The wizard's clock, fixed when it opened, so "in the future" is checked without calling Date.now() in render. */
  nowMs?: number;
}
