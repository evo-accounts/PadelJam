import type {
  EntranceFeeMethod,
  EventType,
  OrganizerRole,
  ScoringMode,
  Specification,
} from '@padel/api';
import type React from 'react';

import type { PickedImage } from '@/lib/storage';

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
  /** Failing field keys for this step, from its `validate()`, once a Next tap has flagged them. */
  errors?: string[];
  /** Drops one key from `errors` as the user corrects that field, so it turns back to normal without waiting for the next Next tap (UX-GLOB-06). */
  clearError?: (key: string) => void;
};

export type WizardStep = {
  key: string;
  titleKey: string;
  Component: React.ComponentType<WizardStepProps>;
  /** Pure: the failing field keys for this step, or [] when the step is complete. */
  validate: (d: EventDraft) => string[];
  isValid: (d: EventDraft) => boolean;
};
