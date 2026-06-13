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
};

export type WizardStep = {
  key: string;
  titleKey: string;
  Component: React.ComponentType<WizardStepProps>;
  isValid: (d: EventDraft) => boolean;
};
