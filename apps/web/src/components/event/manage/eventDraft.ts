import type { EventDetail } from '@padel/api';
import { courtsReserved } from '@padel/utils';

import { manualCourtNamesPayload, manualPointPayload } from '../wizard/draft-logic';
import type { WebWizardDraft } from '../wizard/types';

/**
 * Manage Event's edit dialogs (UX-MEVT-04..08) as pure draft helpers — the web port of mobile's
 * `components/event/manage/eventDraft.ts`.
 *
 * `update_event` REPLACES every editable column from its payload, so a dialog never sends only its
 * own fields: each one starts from `draftFromEvent(event)` — every field as stored — edits its
 * slice, and `updateValues` turns the whole draft back into the payload.
 */

/** The wizard draft plus the stored thumbnail, which the edit dialogs keep unless replaced. */
export type ManageDraft = WebWizardDraft & { thumbnailPath?: string };

/** How the stored event answers the Location step (UX-CEVT-06). */
export function locationModeOf(e: Pick<EventDetail, 'venue_id' | 'has_location'>): WebWizardDraft['locationMode'] {
  if (e.venue_id) return 'registry';
  return e.has_location ? 'manual' : 'none';
}

/**
 * `courtIds`: the registry courts the event uses (`event_courts`) — seeded only for a registry
 * venue, where they are the "Select courts" answer; none means "Have not reserved yet".
 */
export function draftFromEvent(e: EventDetail, courtIds?: string[]): ManageDraft {
  return {
    groupId: e.group_id,
    eventType: e.event_type,
    specification: e.specification,
    scoringMode: e.scoring_mode,
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
      method: e.entrance_fee_method ?? undefined,
      mbaNumber: e.entrance_fee_mba_number ?? undefined,
    },
    playersSubmitResults: e.players_submit_results,
    // Never edited (decision 8), but update_event's schema requires it, so it goes back as stored.
    organizerRole: e.organizer_role,
    name: e.name,
    description: e.description ?? '',
    thumbnailPath: e.thumbnail_path ?? undefined,
  };
}

/** Did the dialog move the event somewhere else? */
export function locationChanged(d: ManageDraft, e: EventDetail): boolean {
  const before = draftFromEvent(e);
  return (
    d.hasLocation !== before.hasLocation ||
    (d.venueId ?? null) !== (before.venueId ?? null) ||
    (d.manualLocationName ?? '') !== (before.manualLocationName ?? '') ||
    (d.manualLocationAddress ?? '') !== (before.manualLocationAddress ?? '') ||
    // Only an address search pick sets a point (the stored event's is never loaded into the draft).
    d.manualLocationPoint != null
  );
}

/**
 * The whole draft as `updateEventSchema` input (`values`), plus the keys that schema does not carry
 * yet (`extra`, merged into the RPC payload by `useSaveEvent`).
 *
 * `thumbnailPath`: the freshly uploaded image's path, or `null` when the image was removed.
 * `courts`: Edit Location & Courts only — also send the courts (0122): a registry venue's ticked
 * courts (none = "Have not reserved yet", courts_reserved false), or a manual venue's court names
 * with blanks named by `courtName(n)` (all blank = none). Other dialogs omit them, so the courts
 * stay as they are.
 *
 * The point: a manual address picked from the address search sends its own point; otherwise none
 * is sent, and update_event keeps the stored one (it only replaces location_point when both
 * location_lat and location_lng are given).
 */
export function updateValues(
  d: ManageDraft,
  opts: { thumbnailPath?: string | null; courts?: { courtName: (n: number) => string } } = {},
): { values: Record<string, unknown>; extra: Record<string, unknown> } {
  const extra: Record<string, unknown> = {};
  let courts: Record<string, unknown> = {};
  if (opts.courts) {
    courts = d.venueId
      ? { courtIds: d.courtIds ?? [], courtsReserved: courtsReserved(d) }
      : { courtsReserved: true };
    if (!d.venueId) extra.manual_court_names = manualCourtNamesPayload(d, opts.courts.courtName) ?? null;
  }
  const thumbnailPath = opts.thumbnailPath === null ? undefined : (opts.thumbnailPath ?? d.thumbnailPath);
  const values = {
    ...courts,
    name: d.name,
    description: d.description?.trim() ? d.description : undefined,
    thumbnailPath,
    startsAt: d.startsAt,
    durationMinutes: d.durationMinutes,
    scoringMode: d.scoringMode,
    scoringValue: d.scoringMode === 'classic' ? null : d.scoringValue,
    allowStandby: d.allowStandby,
    standbySpots: d.allowStandby ? d.standbySpots : undefined,
    isPrivate: d.groupId == null ? true : d.isPrivate,
    entranceFee: d.entranceFee.enabled
      ? {
          enabled: true,
          amount: d.entranceFee.amount,
          method: d.entranceFee.method,
          mbaNumber: d.entranceFee.method === 'mba' ? d.entranceFee.mbaNumber : undefined,
        }
      : { enabled: false },
    playersSubmitResults: d.playersSubmitResults,
    organizerRole: d.organizerRole,
    hasLocation: d.hasLocation,
    numCourts: d.numCourts,
    venueId: d.venueId,
    manualLocationName: d.manualLocationName?.trim() ? d.manualLocationName : undefined,
    manualLocationAddress: d.manualLocationAddress?.trim() ? d.manualLocationAddress : undefined,
    ...manualPointPayload(d),
  };
  return { values, extra };
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
 * whole location.
 */
export function locationOverrides(d: ManageDraft, courtName: (n: number) => string): Record<string, unknown> {
  const venue = d.venueId ?? null;
  const names = venue ? undefined : manualCourtNamesPayload(d, courtName);
  const point = manualPointPayload(d);
  return {
    venue_id: venue,
    manual_location_name: venue ? null : d.manualLocationName?.trim() || null,
    manual_location_address: venue ? null : d.manualLocationAddress?.trim() || null,
    has_location: d.hasLocation,
    num_courts: d.numCourts,
    ...(names ? { manual_court_names: names } : {}),
    // A picked manual address carries its point; without one the copy has none (duplicate_event).
    ...(point.locationLat != null ? { location_lat: point.locationLat, location_lng: point.locationLng } : {}),
    ...(venue ? { court_ids: d.courtIds ?? [], courts_reserved: courtsReserved(d) } : {}),
    location_text: d.hasLocation ? (d.manualLocationName?.trim() || d.manualLocationAddress?.trim() || null) : null,
  };
}

/** Did the organizer touch the location or courts at all (Duplicate sends them only then)? */
export function courtsOrLocationChanged(d: ManageDraft, e: EventDetail, courtIds?: string[]): boolean {
  const before = draftFromEvent(e, courtIds);
  const same = (a?: string[], b?: string[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  return (
    locationChanged(d, e) ||
    d.numCourts !== before.numCourts ||
    !same(d.courtIds, before.courtIds) ||
    !same(d.manualCourtNames, before.manualCourtNames)
  );
}
