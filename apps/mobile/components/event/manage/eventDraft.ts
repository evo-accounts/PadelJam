import type { EventDetail } from '@padel/api';

import type { EventDraft } from '../wizard/draft';
import { normalizeCourtNames } from '../wizard/location';

/**
 * Manage Event's edit sheets (UX-MEVT-04..08) as pure draft helpers. RN-free so they are
 * unit-testable.
 *
 * `update_event` REPLACES every editable column from its payload, so a sheet never sends only
 * its own fields: each sheet starts from `draftFromEvent(event)` — every field as stored — edits
 * its slice, and `updateValues` turns the whole draft back into the payload.
 */

/** How the stored event answers the Location step (UX-CEVT-06). */
export function locationModeOf(e: Pick<EventDetail, 'venue_id' | 'has_location'>): EventDraft['locationMode'] {
  if (e.venue_id) return 'registry';
  return e.has_location ? 'manual' : 'none';
}

/**
 * `courtIds`: the registry courts the event uses (`useEventCourts`) — seeded only for a registry
 * venue, where they are the "Select courts" answer; none means "Have not reserved yet".
 */
export function draftFromEvent(e: EventDetail, courtIds?: string[]): EventDraft {
  return {
    groupId: e.group_id,
    eventType: e.event_type as EventDraft['eventType'],
    specification: e.specification as EventDraft['specification'],
    scoringMode: e.scoring_mode as EventDraft['scoringMode'],
    scoringValue: e.scoring_value,
    locationMode: locationModeOf(e),
    hasLocation: e.has_location,
    venueId: e.venue_id ?? undefined,
    // A registry venue's name rides in the manual name, as `chooseVenue` does; the payload
    // builder drops it from the manual columns because a venue is set.
    manualLocationName: e.venue?.name ?? e.manual_location_name ?? undefined,
    manualLocationAddress: e.venue_id ? (e.venue?.address ?? undefined) : (e.manual_location_address ?? undefined),
    numCourts: e.num_courts,
    courtIds: e.venue_id && courtIds && courtIds.length > 0 ? courtIds : undefined,
    manualCourtNames: e.venue_id ? undefined : (e.manual_court_names ?? undefined),
    // PostgREST answers `…+00:00`; updateEventSchema's datetime() takes only the `Z` form.
    startsAt: new Date(e.starts_at).toISOString(),
    durationMinutes: e.duration_minutes,
    allowStandby: e.allow_standby,
    standbySpots: e.standby_spots ?? undefined,
    isPrivate: e.is_private,
    entranceFee: {
      enabled: e.entrance_fee_enabled,
      amount: e.entrance_fee_amount ?? undefined,
      method: (e.entrance_fee_method ?? undefined) as EventDraft['entranceFee']['method'],
      mbaNumber: e.entrance_fee_mba_number ?? undefined,
    },
    playersSubmitResults: e.players_submit_results,
    // Never edited (decision 8), but update_event writes it, so it goes back as stored.
    organizerRole: e.organizer_role as EventDraft['organizerRole'],
    name: e.name,
    description: e.description ?? '',
    thumbnailPath: e.thumbnail_path ?? undefined,
  };
}

/** Did the sheet move the event somewhere else? Then its point is geocoded again. */
export function locationChanged(d: EventDraft, e: EventDetail): boolean {
  const before = draftFromEvent(e);
  return (
    d.hasLocation !== before.hasLocation ||
    (d.venueId ?? null) !== (before.venueId ?? null) ||
    (d.manualLocationName ?? '') !== (before.manualLocationName ?? '') ||
    (d.manualLocationAddress ?? '') !== (before.manualLocationAddress ?? '')
  );
}

/**
 * The whole draft as `updateEventSchema` input. `thumbnailPath` is the freshly uploaded image's
 * path when one was picked; `coords` a new point when the location changed (omitted, update_event
 * keeps the stored one).
 */
export function updateValues(
  d: EventDraft,
  opts: {
    thumbnailPath?: string;
    coords?: { lat: number; lng: number } | null;
    /**
     * Edit Location & Courts only: also send the courts (0122) — a registry venue's ticked courts
     * (none = "Have not reserved yet", courts_reserved false), or a manual venue's court names
     * with blanks named by `courtName(n)`. Other sheets omit them, so the courts stay as they are.
     */
    courts?: { courtName: (n: number) => string };
  } = {},
): Record<string, unknown> {
  const courts = opts.courts
    ? d.venueId
      ? { courtIds: d.courtIds ?? [], courtsReserved: (d.courtIds?.length ?? 0) > 0 }
      : { manualCourtNames: d.hasLocation ? normalizeCourtNames(d, opts.courts.courtName) : undefined }
    : {};
  return {
    ...courts,
    name: d.name,
    description: d.description?.trim() ? d.description : undefined,
    thumbnailPath: opts.thumbnailPath ?? d.thumbnailPath,
    startsAt: d.startsAt,
    durationMinutes: d.durationMinutes,
    scoringMode: d.scoringMode,
    scoringValue: d.scoringMode === 'classic' ? null : d.scoringValue,
    allowStandby: d.allowStandby,
    standbySpots: d.allowStandby ? d.standbySpots : undefined,
    isPrivate: d.isPrivate,
    entranceFee: d.entranceFee.enabled
      ? d.entranceFee
      : { enabled: false, amount: undefined, method: undefined, mbaNumber: undefined },
    playersSubmitResults: d.playersSubmitResults,
    organizerRole: d.organizerRole,
    hasLocation: d.hasLocation,
    numCourts: d.numCourts,
    venueId: d.venueId,
    manualLocationName: d.manualLocationName?.trim() ? d.manualLocationName : undefined,
    manualLocationAddress: d.manualLocationAddress?.trim() ? d.manualLocationAddress : undefined,
    locationLat: opts.coords?.lat,
    locationLng: opts.coords?.lng,
  };
}

/**
 * Edit Location & Courts (UX-MEVT-07): capacity may not drop below the players already confirmed
 * (stand-by excluded, as update_event counts them). The client twin of `courts_below_roster`.
 */
export function courtsBelowRoster(numCourts: number, confirmedMain: number): boolean {
  return numCourts * 4 < confirmedMain;
}

/**
 * Duplicate (UX-MEVT-20, decision 4): the location and courts as `duplicate_event` overrides
 * (0122) — sent only when the organizer changed them, since sending any location key replaces the
 * whole location (and a point it is not given is left empty).
 */
export function locationOverrides(
  d: EventDraft,
  coords: { lat: number; lng: number } | null,
  courtName: (n: number) => string,
): Record<string, unknown> {
  const venue = d.venueId ?? null;
  const names = venue ? undefined : normalizeCourtNames(d, courtName);
  return {
    venue_id: venue,
    manual_location_name: venue ? null : (d.manualLocationName?.trim() || null),
    manual_location_address: venue ? null : (d.manualLocationAddress?.trim() || null),
    has_location: d.hasLocation,
    num_courts: d.numCourts,
    ...(names ? { manual_court_names: names } : {}),
    ...(venue ? { court_ids: d.courtIds ?? [], courts_reserved: (d.courtIds?.length ?? 0) > 0 } : {}),
    ...(coords ? { location_lat: coords.lat, location_lng: coords.lng } : {}),
    location_text: d.hasLocation ? (d.manualLocationName ?? d.manualLocationAddress ?? null) : null,
  };
}

/** Did the organizer touch the location or courts at all (Duplicate sends them only then)? */
export function courtsOrLocationChanged(d: EventDraft, e: EventDetail, courtIds?: string[]): boolean {
  const before = draftFromEvent(e, courtIds);
  const same = (a?: string[], b?: string[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  return (
    locationChanged(d, e) ||
    d.numCourts !== before.numCourts ||
    !same(d.courtIds, before.courtIds) ||
    !same(d.manualCourtNames, before.manualCourtNames)
  );
}
