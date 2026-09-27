import { rosterOverflows, rosterRoom, skipsInvite, type RosterRoom } from '@padel/utils';

import type { WebGuestDraft, WebInvitee, WebWizardDraft } from './types';

/**
 * Invite players (UX-CEVT-11) as pure draft operations, React-free. A port of mobile's
 * `wizard/invite.ts`, so both wizards send the same invitees and guests for the same answers.
 * Platform players become `invitees` (they get an invitation and answer it); guests are people with
 * no access to the app, confirmed on creation (decision 7, migration 0113).
 */

export type PickablePlayer = { id: string; full_name: string | null; avatar_url: string | null };
export type GuestInput = { name: string; gender?: 'male' | 'female' };

/** Ticks a platform player, or unticks one already picked. */
export function togglePlayer(invitees: readonly WebInvitee[] | undefined, p: PickablePlayer): WebInvitee[] {
  const list = invitees ?? [];
  return list.some((i) => i.invitee_id === p.id)
    ? list.filter((i) => i.invitee_id !== p.id)
    : [...list, { invitee_id: p.id, name: p.full_name ?? undefined, avatarUrl: p.avatar_url }];
}

const guestEntry = (key: string, guest: GuestInput, mixed: boolean): WebGuestDraft => {
  const entry: WebGuestDraft = { key, name: guest.name.trim() };
  if (mixed && guest.gender) entry.gender = guest.gender;
  return entry;
};

/** Adds a guest with a trimmed name; a gender only on a mixed event. */
export const addGuest = (
  guests: readonly WebGuestDraft[] | undefined,
  guest: GuestInput,
  key: string,
  mixed: boolean,
): WebGuestDraft[] => [...(guests ?? []), guestEntry(key, guest, mixed)];

export const removeGuest = (guests: readonly WebGuestDraft[] | undefined, key: string): WebGuestDraft[] =>
  (guests ?? []).filter((g) => g.key !== key);

/** Replaces one guest's name and gender (a mixed event's missing gender is set this way). */
export const updateGuest = (
  guests: readonly WebGuestDraft[] | undefined,
  key: string,
  guest: GuestInput,
  mixed: boolean,
): WebGuestDraft[] => (guests ?? []).map((g) => (g.key === key ? guestEntry(key, guest, mixed) : g));

/**
 * Guests are added on Invite players only for classic and mixed events. A team event's guest joins
 * as a player's partner instead (UX-JEVT-10): a lone guest could not hold a spot without a pair.
 */
export const guestsAllowed = (d: Pick<WebWizardDraft, 'specification'>): boolean => d.specification !== 'team';

/** The spots this draft leaves, counting the organizer (when playing) and every guest. */
export function draftRoster(d: WebWizardDraft, organizerGender?: string | null): RosterRoom {
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
 * What is wrong with the guest list as it stands, if anything — the organizer may have gone back and
 * changed the format or the capacity after adding guests:
 *   team      the event became a team event, which takes no wizard guests
 *   gender    it became mixed, and a guest has no gender yet
 *   capacity  the guests no longer fit
 */
export function guestIssue(d: WebWizardDraft, organizerGender?: string | null): 'team' | 'gender' | 'capacity' | null {
  const guests = d.guests ?? [];
  if (guests.length === 0) return null;
  if (!guestsAllowed(d)) return 'team';
  if (d.specification === 'mixed' && guests.some((g) => !g.gender)) return 'gender';
  return rosterOverflows(draftRoster(d, organizerGender)) ? 'capacity' : null;
}

/** Invite players' gate: the guest list must still work (the step itself refuses guests that do not fit). */
export const inviteErrors = (d: WebWizardDraft, organizerGender?: string | null): string[] =>
  guestIssue(d, organizerGender) ? ['guests'] : [];

/**
 * The invite half of the create payload. Nothing when the path has no Invite players step — even
 * people picked before it disappeared (the event was made public afterwards; decision 5) — or when
 * the organizer chose "I will invite later".
 */
export function invitePayload(
  d: WebWizardDraft,
  opts: { later?: boolean } = {},
): { invitees?: { invitee_id: string }[]; guests?: { name: string; gender: 'male' | 'female' | null }[] } {
  if (opts.later || skipsInvite(d)) return { invitees: undefined, guests: undefined };
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
