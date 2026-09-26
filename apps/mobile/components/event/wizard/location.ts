import { COURTS_MAX, COURTS_MIN } from '@padel/utils';

import type { EventDraft } from './draft';

/**
 * The Location step's three answers (UX-CEVT-06) as draft patches. RN-free so they are
 * unit-testable. Each one clears what the other two set, so the draft never carries a venue AND
 * manual fields (the `events_venue_xor_manual` check) or leftovers from an abandoned path.
 */

type RegistryVenue = { id: string; name: string; address: string | null };

const cleared: Partial<EventDraft> = {
  venueId: undefined,
  manualLocationName: undefined,
  manualLocationAddress: undefined,
  manualCourtNames: undefined,
  locationLat: undefined,
  locationLng: undefined,
  courtIds: undefined,
};

/**
 * Scenario 1: a registry venue. Its name and address ride along so the wizard's finalize can
 * geocode the event's point silently, as before; the payload builder drops them from the manual
 * columns because a venue is set. A different venue forgets the courts picked at the last one.
 */
export function chooseVenue(d: EventDraft, v: RegistryVenue): Partial<EventDraft> {
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

/**
 * Scenario 2: opens the manual venue form. Re-opening it keeps what was typed; coming from the
 * registry starts it empty rather than pre-filled with the registry venue's name.
 */
export function openManualVenue(d: EventDraft): Partial<EventDraft> {
  if (d.locationMode === 'manual') return {};
  return { ...cleared, locationMode: 'manual', hasLocation: true };
}

/** Scenario 3: no location. Courts then shows only the count. */
export const noLocation = (): Partial<EventDraft> => ({
  ...cleared,
  locationMode: 'none',
  hasLocation: false,
});

/** Back from the manual form to the registry list, with nothing chosen yet. */
export const backToVenueList = (): Partial<EventDraft> => ({
  ...cleared,
  locationMode: undefined,
  hasLocation: false,
});

export const clampCourts = (n: number) => Math.min(COURTS_MAX, Math.max(COURTS_MIN, Math.round(n)));

/**
 * A manual venue's court count; the name list follows it — shrinking drops the trailing names,
 * growing leaves the new courts unnamed.
 */
export function setManualCourtCount(d: EventDraft, n: number): Partial<EventDraft> {
  const numCourts = clampCourts(n);
  const names = (d.manualCourtNames ?? []).slice(0, numCourts);
  return { numCourts, manualCourtNames: names };
}

export function setManualCourtName(d: EventDraft, index: number, name: string): Partial<EventDraft> {
  const names = Array.from({ length: d.numCourts }, (_, i) => d.manualCourtNames?.[i] ?? '');
  names[index] = name;
  return { manualCourtNames: names };
}

/**
 * Courts at a registry venue (UX-CEVT-07): ticking one adds it, unticking removes it, and the
 * event's court count is the number ticked (at least one — the empty case is flagged by the
 * step's validator instead).
 */
export function toggleCourt(d: EventDraft, courtId: string): Partial<EventDraft> {
  const current = d.courtIds ?? [];
  const courtIds = current.includes(courtId)
    ? current.filter((id) => id !== courtId)
    : [...current, courtId];
  return { courtIds, numCourts: Math.max(COURTS_MIN, courtIds.length) };
}

/** "Select courts" vs "Have not reserved yet": the list starts with nothing ticked. */
export function setCourtSelection(d: EventDraft, select: boolean): Partial<EventDraft> {
  if (select) return d.courtIds ? {} : { courtIds: [] };
  return { courtIds: undefined, numCourts: clampCourts(d.numCourts) };
}

/** `events.manual_court_names` allows 1–40 characters a court (0113). */
export const COURT_NAME_MAX = 40;

/**
 * A manual venue's court names as `create_event` takes them (0113): exactly `numCourts` entries,
 * each trimmed to 1–40 characters, or nothing at all. The draft pads with '' and can be shorter
 * than the count (growing the count leaves the new courts unnamed), so: every name blank → send
 * nothing; otherwise each blank takes the default label (`fallback(n)`, 1-based — "Court 2").
 * A registry venue names its courts itself, so it never sends any.
 */
export function normalizeCourtNames(
  d: Pick<EventDraft, 'manualCourtNames' | 'numCourts' | 'venueId'>,
  fallback: (n: number) => string,
): string[] | undefined {
  if (d.venueId) return undefined;
  const names = Array.from({ length: Math.max(0, d.numCourts) }, (_, i) =>
    (d.manualCourtNames?.[i] ?? '').trim().slice(0, COURT_NAME_MAX),
  );
  if (names.every((n) => n.length === 0)) return undefined;
  return names.map((n, i) => n || fallback(i + 1).trim().slice(0, COURT_NAME_MAX));
}
