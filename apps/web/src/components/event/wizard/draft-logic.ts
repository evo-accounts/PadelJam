import {
  COURTS_MAX,
  COURTS_MIN,
  defaultStart,
  DURATION_MAX,
  DURATION_MIN,
  draftToCreateInput,
  STANDBY_MAX,
  STANDBY_MIN,
  timeOf,
  type StepKey,
  type WizardSeries,
} from '@padel/utils';

import { invitePayload } from './invite-logic';
import type { WebWizardDraft } from './types';

/**
 * The Location, Courts and Date steps' draft rules (UX-CEVT-06..08), React-free. A port of
 * mobile's `wizard/location.ts`, `draftPatch.ts` (onEnterStep) and `stepValidators.ts` (5–7), so
 * both wizards write the same draft for the same answers.
 */

type RegistryVenue = { id: string; name: string; address: string | null };

const cleared: Partial<WebWizardDraft> = {
  venueId: undefined,
  manualLocationName: undefined,
  manualLocationAddress: undefined,
  manualCourtNames: undefined,
  courtIds: undefined,
};

// --- Location (UX-CEVT-06) ----------------------------------------------------------------------

/**
 * Scenario 1: a registry venue. Its name and address ride along as `location_text` (the payload
 * builder drops them from the manual columns because a venue is set). A different venue forgets
 * the courts picked at the last one.
 */
export function chooseVenue(d: WebWizardDraft, v: RegistryVenue): Partial<WebWizardDraft> {
  return {
    ...cleared,
    locationMode: 'registry',
    hasLocation: true,
    venueId: v.id,
    manualLocationName: v.name,
    manualLocationAddress: v.address ?? undefined,
    courtIds: d.venueId === v.id ? d.courtIds : undefined,
  };
}

/** Scenario 2: the manual venue form. Re-opening it keeps what was typed. */
export function openManualVenue(d: WebWizardDraft): Partial<WebWizardDraft> {
  if (d.locationMode === 'manual') return {};
  return { ...cleared, locationMode: 'manual', hasLocation: true };
}

/** Scenario 3: no location. Courts then shows only the count. */
export const noLocation = (): Partial<WebWizardDraft> => ({
  ...cleared,
  locationMode: 'none',
  hasLocation: false,
});

/** Back from the manual form to the registry list, with nothing chosen yet. */
export const backToVenueList = (): Partial<WebWizardDraft> => ({
  ...cleared,
  locationMode: undefined,
  hasLocation: false,
});

export const clampCourts = (n: number) => Math.min(COURTS_MAX, Math.max(COURTS_MIN, Math.round(n)));

/** A manual venue's court count; shrinking drops the trailing names, growing leaves new courts unnamed. */
export function setManualCourtCount(d: WebWizardDraft, n: number): Partial<WebWizardDraft> {
  const numCourts = clampCourts(n);
  return { numCourts, manualCourtNames: (d.manualCourtNames ?? []).slice(0, numCourts) };
}

export function setManualCourtName(d: WebWizardDraft, index: number, name: string): Partial<WebWizardDraft> {
  const names = Array.from({ length: d.numCourts }, (_, i) => d.manualCourtNames?.[i] ?? '');
  names[index] = name;
  return { manualCourtNames: names };
}

/**
 * What `manual_court_names` carries: nothing when no court was named; otherwise one trimmed name
 * per court, a blank one taking the placeholder the field showed ("Court 2") — the column holds
 * every court's name or none (0113 `events_manual_court_names_ok`).
 */
export function manualCourtNamesPayload(
  d: WebWizardDraft,
  placeholder: (number: number) => string,
): string[] | undefined {
  if (d.venueId || d.locationMode !== 'manual') return undefined;
  const names = Array.from({ length: d.numCourts }, (_, i) => (d.manualCourtNames?.[i] ?? '').trim());
  if (names.every((n) => !n)) return undefined;
  return names.map((n, i) => n || placeholder(i + 1));
}

// --- Courts (UX-CEVT-07) ------------------------------------------------------------------------

/**
 * Ticking a court adds it, unticking removes it; the court count is the number ticked (min 1).
 * At most COURTS_MAX can be ticked — beyond it the count would be invalid with nothing to show why.
 */
export function toggleCourt(d: WebWizardDraft, courtId: string): Partial<WebWizardDraft> {
  const current = d.courtIds ?? [];
  if (!current.includes(courtId) && current.length >= COURTS_MAX) return {};
  const courtIds = current.includes(courtId)
    ? current.filter((id) => id !== courtId)
    : [...current, courtId];
  return { courtIds, numCourts: Math.max(COURTS_MIN, courtIds.length) };
}

/** "Select courts" vs "Have not reserved yet": the list starts with nothing ticked. */
export function setCourtSelection(d: WebWizardDraft, select: boolean): Partial<WebWizardDraft> {
  if (select) return d.courtIds ? {} : { courtIds: [] };
  return { courtIds: undefined, numCourts: clampCourts(d.numCourts) };
}

// --- Date (UX-CEVT-08) --------------------------------------------------------------------------

/** The weekly series a recurring event carries, derived from its start and duration. */
export function deriveSeries(
  startsAt: string | undefined,
  durationMinutes: number,
  inviteLeadDays: WizardSeries['inviteLeadDays'],
): WizardSeries | undefined {
  if (!startsAt) return undefined;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return undefined;
  return { dayOfWeek: d.getDay() === 0 ? 7 : d.getDay(), startTime: timeOf(d), durationMinutes, inviteLeadDays };
}

/** The Date step opens on a start already chosen: the first free slot an hour or more away. */
export function onEnterStep(d: WebWizardDraft, key: StepKey, nowMs: number): WebWizardDraft {
  if (key === 'date' && !d.startsAt) return { ...d, startsAt: defaultStart(new Date(nowMs)).toISOString() };
  return d;
}

// --- Validation (UX-GLOB-06) --------------------------------------------------------------------

const courtsInRange = (n: number) => Number.isInteger(n) && n >= COURTS_MIN && n <= COURTS_MAX;

/** Location validates only the manual venue form: an address (the name is optional) and 1–20 courts. */
export function locationErrors(d: WebWizardDraft): string[] {
  if (d.locationMode !== 'manual') return [];
  const errors: string[] = [];
  if (!(d.manualLocationAddress ?? '').trim()) errors.push('manualLocationAddress');
  if (!courtsInRange(d.numCourts)) errors.push('numCourts');
  return errors;
}

/** Courts: a count in range, and — when picking a venue's courts — at least one ticked. */
export function courtsErrors(d: WebWizardDraft): string[] {
  if (d.courtIds && d.courtIds.length === 0) return ['courtIds'];
  return courtsInRange(d.numCourts) ? [] : ['numCourts'];
}

/** Date: a start still in the future and a whole duration of 15–480 minutes. */
export function dateErrors(d: WebWizardDraft, nowMs: number): string[] {
  const errors: string[] = [];
  if (!d.startsAt || new Date(d.startsAt).getTime() <= nowMs) errors.push('startsAt');
  const m = d.durationMinutes;
  if (!(Number.isInteger(m) && m >= DURATION_MIN && m <= DURATION_MAX)) errors.push('durationMinutes');
  return errors;
}

/**
 * Preferences (UX-CEVT-09): the values a toggle opens are checked only while it is on — stand-by's
 * extra spots (1–20), and the fee's amount, method and, for MB WAY, the number to pay.
 */
export function preferencesErrors(d: WebWizardDraft): string[] {
  const errors: string[] = [];
  if (d.allowStandby) {
    const n = d.standbySpots;
    if (!(n != null && Number.isInteger(n) && n >= STANDBY_MIN && n <= STANDBY_MAX)) errors.push('standbySpots');
  }
  const fee = d.entranceFee;
  if (!fee.enabled) return errors;
  if (!(fee.amount != null && fee.amount > 0)) errors.push('feeAmount');
  if (!fee.method) errors.push('feeMethod');
  if (fee.method === 'mba' && !(fee.mbaNumber ?? '').trim()) errors.push('feeMbaNumber');
  return errors;
}

/** Details (UX-CEVT-10): the name is the one required field. */
export const detailsErrors = (d: WebWizardDraft): string[] => (d.name.trim().length > 0 ? [] : ['name']);

// --- Submit -------------------------------------------------------------------------------------

/**
 * The create input for this draft: the shared builder, with a manual venue's blank name or
 * address sent as none, a registry venue's ticked courts, a manual venue's court names, and the
 * invite half — platform players invited, guests confirmed; none on a path without Invite players
 * (a public group event, decision 5) or on "I will invite later" (`later`).
 * The web has no geocoder, so the event's point is left empty.
 */
export function webCreateInput(
  d: WebWizardDraft,
  thumbnailPath: string | undefined,
  courtNamePlaceholder: (number: number) => string,
  opts: { later?: boolean } = {},
): Record<string, unknown> {
  const base = draftToCreateInput(
    {
      ...d,
      manualLocationName: d.manualLocationName?.trim() || undefined,
      manualLocationAddress: d.manualLocationAddress?.trim() || undefined,
    },
    thumbnailPath,
  );
  return {
    ...base,
    courtIds: d.venueId && d.courtIds && d.courtIds.length > 0 ? d.courtIds : undefined,
    manualCourtNames: manualCourtNamesPayload(d, courtNamePlaceholder),
    ...invitePayload(d, opts),
  };
}
