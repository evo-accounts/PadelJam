import { CUSTOM_POINTS_MAX, CUSTOM_POINTS_MIN, MINUTES_MAX, MINUTES_MIN } from './event-scoring';

export interface WizardSeries {
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  inviteLeadDays: 3 | 5 | 7;
}
/**
 * A platform user (invitee_id) or, interim until M3 / W-M3, a manual entry sent as a guest by name
 * (0113), with a gender on mixed events.
 */
export interface WizardInvitee {
  invitee_id?: string;
  name?: string;
  gender?: 'male' | 'female';
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
  4: (d) => {
    if (!d.scoringMode) return false;
    if (d.scoringMode === 'classic') return true;
    // Decision 9: Points take 1–99 (presets or Custom), Time the slider's 1–90 minutes.
    const [min, max] =
      d.scoringMode === 'points' ? [CUSTOM_POINTS_MIN, CUSTOM_POINTS_MAX] : [MINUTES_MIN, MINUTES_MAX];
    const v = d.scoringValue;
    return v != null && Number.isInteger(v) && v >= min && v <= max;
  },
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

/**
 * Interim bridge for the current wizards (mobile InvitePicker, web Step10Invite) until M3 / W-M3
 * rebuild the invite step: entries with an invitee_id stay invitations; a manual entry becomes a
 * guest by its name and gender (0113 dropped the email/phone invitation path). Unnamed entries are
 * dropped. The one copy — packages/api and the mobile wizard use it too.
 */
export function splitWizardInvitees(list: WizardInvitee[] | undefined): {
  invitees?: { invitee_id: string }[];
  guests?: { name: string; gender?: 'male' | 'female' }[];
} {
  const invitees = (list ?? []).flatMap((i) => (i.invitee_id ? [{ invitee_id: i.invitee_id }] : []));
  const guests = (list ?? []).flatMap((i) =>
    !i.invitee_id && i.name?.trim()
      ? [{ name: i.name.trim(), ...(i.gender ? { gender: i.gender } : {}) }]
      : [],
  );
  return {
    invitees: invitees.length > 0 ? invitees : undefined,
    guests: guests.length > 0 ? guests : undefined,
  };
}

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
    // 0113: platform users stay invitations; a manual entry becomes a guest by its name (the
    // email/phone invitation path is gone). Interim until W-M3 rebuilds the invite step.
    ...splitWizardInvitees(d.invitees),
  };
}

/**
 * Whether the event's courts are reserved (events.courts_reserved, migration 0122): false only when
 * a registry venue is picked and no court is ticked — the Courts step's "Have not reserved yet".
 * A manual venue or no location has no court list to reserve from. Drives the "Courts not
 * reserved" pending action (UX-MEVT-24).
 */
export function courtsReserved(d: { venueId?: string | null; courtIds?: readonly string[] | null }): boolean {
  return !d.venueId || (d.courtIds?.length ?? 0) > 0;
}
