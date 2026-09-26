import { PLAYERS_PER_COURT } from './event-schedule';

/**
 * The create-event wizard's roster maths (UX-CEVT-09, UX-CEVT-11), mirroring what `create_event`
 * enforces so the organizer is stopped while adding a guest instead of at "Create event".
 *
 * Server rules this copies (migrations 0044, 0112, 0113):
 *   capacity   = courts × 4 + stand-by spots (when stand-by is allowed)      — event_capacity()
 *   per gender = floor(capacity / 2) on a mixed event                        — _mixed_gender_full()
 *   the organizer takes a confirmed spot when organizing AND playing, counted against their own
 *   gender on a mixed event (a profile with no gender counts only toward the total);
 *   every guest is confirmed, so each takes a spot — invitees take none until they accept.
 */

/** Requirements (decision 9): 1–20 stand-by spots, 4 by default. */
export const STANDBY_MIN = 1;
export const STANDBY_MAX = 20;
export const DEFAULT_STANDBY = 4;

export type RosterGender = 'male' | 'female';

export type RosterInput = {
  numCourts: number;
  specification: string | undefined;
  allowStandby: boolean;
  standbySpots?: number | null;
  /** `organizerRole === 'organizing_and_playing'`. */
  organizerPlays: boolean;
  organizerGender?: string | null;
  guests: readonly { gender?: string | null }[];
};

export type RosterRoom = {
  /** Every spot, stand-by included. */
  capacity: number;
  /** Spots not yet taken by the organizer or a guest. Negative when over capacity. */
  remaining: number;
  /** Mixed events only: spots left per gender. */
  perGender: Record<RosterGender, number> | null;
};

const isGender = (g: string | null | undefined): g is RosterGender => g === 'male' || g === 'female';

export function rosterRoom(r: RosterInput): RosterRoom {
  const standby = r.allowStandby ? Math.max(0, r.standbySpots ?? 0) : 0;
  const capacity = Math.max(0, r.numCourts) * PLAYERS_PER_COURT + standby;
  const taken = (r.organizerPlays ? 1 : 0) + r.guests.length;
  if (r.specification !== 'mixed') return { capacity, remaining: capacity - taken, perGender: null };

  const half = Math.floor(capacity / 2);
  const left: Record<RosterGender, number> = { male: half, female: half };
  if (r.organizerPlays && isGender(r.organizerGender)) left[r.organizerGender] -= 1;
  for (const g of r.guests) if (isGender(g.gender)) left[g.gender] -= 1;
  return { capacity, remaining: capacity - taken, perGender: left };
}

/**
 * Why one more guest (of `gender`, on a mixed event) does not fit, or null when it does. The codes
 * are the ones `create_event` would raise, so they share the error copy.
 */
export function guestBlocker(room: RosterRoom, gender?: string | null): 'event_full' | 'gender_full' | null {
  if (room.remaining <= 0) return 'event_full';
  if (room.perGender && isGender(gender) && room.perGender[gender] <= 0) return 'gender_full';
  return null;
}

/** The roster no longer fits — the organizer went back and lowered courts, stand-by or their role. */
export function rosterOverflows(room: RosterRoom): boolean {
  if (room.remaining < 0) return true;
  return room.perGender != null && (room.perGender.male < 0 || room.perGender.female < 0);
}
