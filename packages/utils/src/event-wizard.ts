export interface WizardSeries {
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  inviteLeadDays: 3 | 5 | 7;
}
export interface WizardInvitee {
  invitee_id?: string;
  name?: string;
  email?: string;
  phone?: string;
}
export interface WizardEntranceFee {
  enabled: boolean;
  amount?: number;
  method?: string;
  mbaNumber?: string;
}
/** Camel-case event draft (primitives only — enums validated at submit by createEventSchema). */
export interface WizardDraft {
  groupId: string | null;
  eventType?: string;
  specification?: string;
  scoringMode?: string;
  scoringValue: number | null;
  manualLocationName?: string;
  manualLocationAddress?: string;
  venueId?: string;
  hasLocation: boolean;
  numCourts: number;
  startsAt?: string;
  durationMinutes: number;
  allowStandby: boolean;
  standbySpots?: number;
  isPrivate: boolean;
  entranceFee: WizardEntranceFee;
  playersSubmitResults: boolean;
  organizerRole: string;
  name: string;
  description?: string;
  series?: WizardSeries;
  invitees?: WizardInvitee[];
}

export const defaultWizardDraft: WizardDraft = {
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

type StepGate = (d: WizardDraft, nowMs: number) => boolean;
type StepGates = { [K in 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10]: StepGate };

/** Per-step Next-button gates, keyed by step number 1..10. nowMs injected for testability. */
export const stepIsValid: StepGates = {
  1: () => true,
  2: (d) => Boolean(d.eventType),
  3: (d) => Boolean(d.specification),
  4: (d) =>
    Boolean(d.scoringMode) &&
    (d.scoringMode === 'classic' || (d.scoringValue != null && d.scoringValue > 0)),
  5: () => true,
  6: (d) => d.numCourts >= 1,
  7: (d, nowMs) =>
    Boolean(d.startsAt) && d.durationMinutes > 0 && new Date(d.startsAt as string).getTime() > nowMs,
  8: (d) =>
    !d.entranceFee.enabled ||
    (d.entranceFee.amount != null && d.entranceFee.amount > 0 && Boolean(d.entranceFee.method)),
  9: (d) => d.name.trim().length > 0,
  10: () => true,
};

/** Build the camelCase CreateEventInput-shaped object from the draft (+ resolved thumbnail path). */
export function draftToCreateInput(d: WizardDraft, thumbnailPath?: string): Record<string, unknown> {
  return {
    groupId: d.groupId,
    eventType: d.eventType,
    specification: d.specification,
    scoringMode: d.scoringMode,
    scoringValue: d.scoringMode === 'classic' ? null : d.scoringValue,
    manualLocationName: d.manualLocationName || undefined,
    manualLocationAddress: d.manualLocationAddress || undefined,
    venueId: d.venueId || undefined,
    hasLocation: d.hasLocation,
    numCourts: d.numCourts,
    startsAt: d.startsAt,
    durationMinutes: d.durationMinutes,
    allowStandby: d.allowStandby,
    standbySpots: d.allowStandby ? d.standbySpots : undefined,
    isPrivate: d.groupId === null ? true : d.isPrivate,
    entranceFee: {
      enabled: d.entranceFee.enabled,
      amount: d.entranceFee.enabled ? d.entranceFee.amount : undefined,
      method: d.entranceFee.enabled ? d.entranceFee.method : undefined,
      mbaNumber: d.entranceFee.method === 'mba' ? d.entranceFee.mbaNumber : undefined,
    },
    playersSubmitResults: d.playersSubmitResults,
    organizerRole: d.organizerRole,
    name: d.name.trim(),
    description: d.description?.trim() || undefined,
    thumbnailPath: thumbnailPath || undefined,
    series: d.series,
    invitees: d.invitees && d.invitees.length > 0 ? d.invitees : undefined,
  };
}
