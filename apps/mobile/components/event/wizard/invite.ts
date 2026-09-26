import { rosterOverflows, rosterRoom, type RosterRoom, skipsInvite } from '@padel/utils';

import type { EventDraft, EventGuestDraft, EventInvitee } from './draft';

/**
 * Invite players (UX-CEVT-11) as pure draft operations — RN-free so they are unit-testable.
 * Platform players become `invitees` (they get an invitation and answer it); guests are people
 * with no access to the app, confirmed on creation (decision 7, migration 0113).
 */

export type PickablePlayer = { id: string; full_name: string | null; avatar_url: string | null };

/** Ticks a platform player, or unticks one already picked. */
export function togglePlayer(invitees: readonly EventInvitee[] | undefined, p: PickablePlayer): EventInvitee[] {
  const list = invitees ?? [];
  return list.some((i) => i.invitee_id === p.id)
    ? list.filter((i) => i.invitee_id !== p.id)
    : [...list, { invitee_id: p.id, name: p.full_name, avatarUrl: p.avatar_url }];
}

/** Adds a guest with a trimmed name; a gender only on a mixed event. */
export function addGuest(
  guests: readonly EventGuestDraft[] | undefined,
  guest: { name: string; gender?: 'male' | 'female' },
  key: string,
  mixed: boolean,
): EventGuestDraft[] {
  const entry: EventGuestDraft = { key, name: guest.name.trim() };
  if (mixed && guest.gender) entry.gender = guest.gender;
  return [...(guests ?? []), entry];
}

export function removeGuest(guests: readonly EventGuestDraft[] | undefined, key: string): EventGuestDraft[] {
  return (guests ?? []).filter((g) => g.key !== key);
}

/** Replaces one guest's name and gender (a mixed event's missing gender is set this way). */
export function updateGuest(
  guests: readonly EventGuestDraft[] | undefined,
  key: string,
  guest: { name: string; gender?: 'male' | 'female' },
  mixed: boolean,
): EventGuestDraft[] {
  return (guests ?? []).map((g) => {
    if (g.key !== key) return g;
    const entry: EventGuestDraft = { key, name: guest.name.trim() };
    if (mixed && guest.gender) entry.gender = guest.gender;
    return entry;
  });
}

/**
 * Guests are added on Invite players only for classic and mixed events. A team event's guest joins
 * as a player's partner instead (UX-JEVT-10): a lone guest could not hold a spot without a pair.
 */
export const guestsAllowed = (d: Pick<EventDraft, 'specification'>): boolean => d.specification !== 'team';

/**
 * What is wrong with the guest list as it stands, if anything — the organizer may have gone back
 * and changed the format or the capacity after adding guests:
 *   team      the event became a team event, which takes no wizard guests
 *   gender    it became mixed, and a guest has no gender yet
 *   capacity  the guests no longer fit
 */
export function guestIssue(d: EventDraft, organizerGender?: string | null): 'team' | 'gender' | 'capacity' | null {
  const guests = d.guests ?? [];
  if (guests.length === 0) return null;
  if (!guestsAllowed(d)) return 'team';
  if (d.specification === 'mixed' && guests.some((g) => !g.gender)) return 'gender';
  return rosterOverflows(draftRoster(d, organizerGender)) ? 'capacity' : null;
}

/** The spots this draft leaves, counting the organizer (when playing) and every guest. */
export function draftRoster(d: EventDraft, organizerGender?: string | null): RosterRoom {
  return rosterRoom({
    numCourts: d.numCourts,
    specification: d.specification,
    allowStandby: d.allowStandby,
    standbySpots: d.standbySpots,
    organizerPlays: d.organizerRole === 'organizing_and_playing',
    organizerGender,
    guests: d.guests ?? [],
  });
}

/**
 * The invite half of the create payload. Nothing when the path has no Invite players step — even
 * people picked before it disappeared (the event was made public afterwards; decision 5) — or when
 * the organizer chose "I will invite later".
 */
export function invitePayload(
  d: EventDraft,
  opts: { later?: boolean } = {},
): { invitees?: { invitee_id: string }[]; guests?: { name: string; gender?: 'male' | 'female' | null }[] } {
  if (opts.later || skipsInvite(d)) return {};
  const invitees = (d.invitees ?? []).map((i) => ({ invitee_id: i.invitee_id }));
  const mixed = d.specification === 'mixed';
  const guests = (guestsAllowed(d) ? (d.guests ?? []) : [])
    .filter((g) => g.name.trim().length > 0)
    .map((g) => ({ name: g.name.trim(), gender: mixed ? (g.gender ?? null) : null }));
  return {
    invitees: invitees.length > 0 ? invitees : undefined,
    guests: guests.length > 0 ? guests : undefined,
  };
}
