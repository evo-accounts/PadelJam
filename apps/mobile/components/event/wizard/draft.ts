import type {
  EntranceFeeMethod,
  EventType,
  OrganizerRole,
  ScoringMode,
  Specification,
} from '@padel/api';
import type React from 'react';

import type { PickedImage } from '@/lib/storage';

import type { StepKey } from './visibleSteps';

export type EventInvitee = {
  invitee_id?: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type EventDraft = {
  groupId: string | null;
  eventType?: EventType;
  specification?: Specification;
  scoringMode?: ScoringMode;
  scoringValue: number | null;
  manualLocationName?: string;
  manualLocationAddress?: string;
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
  courtIds?: string[];
};

export const defaultDraft: EventDraft = {
  groupId: null,
  scoringValue: null,
  hasLocation: false,
  numCourts: 1,
  durationMinutes: 90,
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
  /** Failing field keys for this step, from its `validate()`, once a Next tap has flagged them. */
  errors?: string[];
  /** Drops one key from `errors` as the user corrects that field, so it turns back to normal without waiting for the next Next tap (UX-GLOB-06). */
  clearError?: (key: string) => void;
};

export type WizardStep = {
  key: StepKey;
  titleKey: string;
  Component: React.ComponentType<WizardStepProps>;
  /**
   * `tap`: a single choice from a list; the card advances and the step has no primary button.
   * `button`: more than one value to set; a primary button is fixed at the bottom.
   */
  advanceBy: 'tap' | 'button';
  /** Replaces the fixed bottom area on a tap step that still needs one (Group's "Continue without group"). */
  Footer?: React.ComponentType<WizardStepProps>;
  /** Pure: the failing field keys for this step, or [] when the step is complete. */
  validate: (d: EventDraft) => string[];
  isValid: (d: EventDraft) => boolean;
};
