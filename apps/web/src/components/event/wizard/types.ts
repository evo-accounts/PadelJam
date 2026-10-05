import type { WizardDraft } from '@padel/utils';

/**
 * A platform player picked on Invite players (UX-CEVT-11). Only `invitee_id` is sent; the name and
 * photo ride along so the step can show who is picked without refetching them.
 */
export interface WebInvitee {
  invitee_id: string;
  name?: string;
  avatarUrl?: string | null;
}

/**
 * A guest (decision 7): someone with no access to the app, added by name — plus a gender on a mixed
 * event — and confirmed for this event only. `key` is wizard-only, so two guests with the same name
 * can still be told apart.
 */
export interface WebGuestDraft {
  key: string;
  name: string;
  gender?: 'male' | 'female';
}

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
  /**
   * A manual venue's point, set only by picking an address search result (the `geocode` edge
   * function). Typing in the address clears it, so a new address never keeps old coordinates.
   */
  manualLocationPoint?: { lat: number; lng: number };
  /** A manual venue's optional court names, one per court (blank = unnamed). */
  manualCourtNames?: string[];
  /** A registry venue's ticked courts ("Select courts"); undefined = "Have not reserved yet". */
  courtIds?: string[];
  /** Platform players picked on Invite players — invited, they answer the invitation. */
  invitees?: WebInvitee[];
  /** Guests, confirmed on creation (0113 `guests`). Never sent on a team event. */
  guests?: WebGuestDraft[];
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
  /** The organizer's own gender: Invite players checks a mixed event's roster against it. */
  organizerGender?: string | null;
}
