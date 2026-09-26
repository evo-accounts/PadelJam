import type {
  EntranceFeeMethod,
  EventType,
  OrganizerRole,
  ScoringMode,
  Specification,
} from '@padel/api';
import type React from 'react';

import type { PickedImage } from '@/lib/storage';

import type { StepKey } from '@padel/utils';

/**
 * A platform player picked on Invite players (UX-CEVT-11). Only `invitee_id` is sent; the name and
 * photo ride along so the step can show who is picked without refetching them.
 */
export type EventInvitee = {
  invitee_id: string;
  name?: string | null;
  avatarUrl?: string | null;
};

/**
 * A guest (decision 7): someone with no access to the app, added by name — plus a gender on a mixed
 * event — and confirmed for this event only. `key` is wizard-only, so two guests with the same
 * name can still be told apart and removed one at a time.
 */
export type EventGuestDraft = {
  key: string;
  name: string;
  gender?: 'male' | 'female';
};

export type EventDraft = {
  groupId: string | null;
  /**
   * The picked group's community — or the route's, when the wizard was opened from a group.
   * Wizard-only (never sent): it is what the recurring-events cap UpgradePrompt points at, which
   * the route alone cannot give when the wizard was opened from Home.
   */
  groupCommunityId?: string;
  eventType?: EventType;
  specification?: Specification;
  scoringMode?: ScoringMode;
  scoringValue: number | null;
  manualLocationName?: string;
  manualLocationAddress?: string;
  /**
   * How the Location step was answered (UX-CEVT-06), wizard-only: a venue from the registry, a
   * venue typed in for this event, or no location. Undefined until one is chosen — the step then
   * opens on the registry list. Which form Location shows follows it, not `hasLocation`.
   */
  locationMode?: 'registry' | 'manual' | 'none';
  /**
   * A manual venue's optional court names, one per court (blank = unnamed). Sent as
   * `manual_court_names` (0113) by `courtNamesForPayload`, which names the blanks.
   */
  manualCourtNames?: string[];
  venueId?: string;
  locationLat?: number;
  locationLng?: number;
  hasLocation: boolean;
  numCourts: number;
  startsAt?: string;
  durationMinutes: number;
  allowStandby: boolean;
  standbySpots?: number;
  isPrivate: boolean;
  entranceFee: {
    enabled: boolean;
    amount?: number;
    method?: EntranceFeeMethod;
    mbaNumber?: string;
  };
  playersSubmitResults: boolean;
  organizerRole: OrganizerRole;
  name: string;
  description?: string;
  thumbnail?: PickedImage | null;
  thumbnailPath?: string;
  series?: {
    dayOfWeek: number;
    startTime: string;
    durationMinutes: number;
    inviteLeadDays: 3 | 5 | 7;
  };
  invitees?: EventInvitee[];
  /** Guests, confirmed on creation (0113 `guests`). */
  guests?: EventGuestDraft[];
  courtIds?: string[];
};

export const defaultDraft: EventDraft = {
  groupId: null,
  scoringValue: null,
  hasLocation: false,
  numCourts: 1,
  // Decision 9: 60 is the default duration (was 90).
  durationMinutes: 60,
  allowStandby: false,
  isPrivate: false,
  entranceFee: { enabled: false },
  playersSubmitResults: false,
  organizerRole: 'organizing_and_playing',
  name: '',
};

export type WizardStepProps = {
  draft: EventDraft;
  patch: (partial: Partial<EventDraft>) => void;
  /**
   * Applies `partial` (if any) and moves to the next VISIBLE step in one go. A tap-to-advance
   * step (UX-CEVT-01) calls this from the card itself — the tap is the answer, so there is no
   * Next button and no selected state left behind.
   *
   * Absent when a step is reused OUTSIDE the wizard — `event/[id]/edit.tsx` renders Scoring,
   * Location, Courts and Preferences as sections of one form.
   */
  advance?: (partial?: Partial<EventDraft>) => void;
  /** The community the wizard was opened from, if any — the Group step lists only its groups. */
  communityId?: string;
  /** Failing field keys for this step, from its `validate()`, once a Next tap has flagged them. */
  errors?: string[];
  /** Drops one key from `errors` as the user corrects that field, so it turns back to normal without waiting for the next Next tap (UX-GLOB-06). */
  clearError?: (key: string) => void;
};

export type AdvanceBy = 'tap' | 'button';

export type ValidateEnv = { organizerGender?: string | null };

export type WizardStep = {
  key: StepKey;
  titleKey: string;
  Component: React.ComponentType<WizardStepProps>;
  /**
   * `tap`: a single choice from a list; the card advances and the step has no primary button.
   * `button`: more than one value to set; a primary button is fixed at the bottom.
   * A function when it depends on the draft: Location is a tap list until the organizer opens
   * the manual venue form, which has fields and therefore a button.
   */
  advanceBy: AdvanceBy | ((d: EventDraft) => AdvanceBy);
  /**
   * The fixed bottom area's own content. On a tap step it replaces the (absent) primary button —
   * Group's "Continue without group", Location's "Do not want to add a location". On a button
   * step it sits above the primary button and is fixed with it — Date's summary box.
   */
  Footer?: React.ComponentType<WizardStepProps>;
  /**
   * A secondary action under the primary button, on the last step only: Invite players' "I will
   * invite later", which creates the event without its invitees and guests (UX-CEVT-11).
   */
  laterKey?: string;
  /**
   * Pure: the failing field keys for this step, or [] when the step is complete. `env` carries what
   * the draft does not hold — the organizer's own gender, which Invite players needs to check a
   * mixed event's roster still fits.
   */
  validate: (d: EventDraft, env?: ValidateEnv) => string[];
  isValid: (d: EventDraft) => boolean;
};

/** `step.advanceBy` for this draft. */
export function advanceByFor(step: Pick<WizardStep, 'advanceBy'>, d: EventDraft): AdvanceBy {
  return typeof step.advanceBy === 'function' ? step.advanceBy(d) : step.advanceBy;
}
