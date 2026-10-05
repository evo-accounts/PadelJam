/**
 * What the event screen's fixed bottom area and top banner show for the viewer (UX-JEVT-02..05).
 * Shared by the mobile and web event pages, so both apps answer the same state table.
 *
 * Pure, so the whole state table is unit-tested rather than discovered on a simulator. The screen
 * reads `bottom` for the bottom area and `banner` for the strip under the header; everything else
 * (the ⋯ sheet, the body) is the same in every state.
 *
 * The waiting-list claim (decision 4) is here: `canClaimWaitlistSpot` mirrors the server's
 * `_waiter_can_claim` (migration 0112) so "Confirm spot" appears exactly when the claim can succeed.
 * Team events (UX-JEVT-09..14): an outsider, or a lone occupant whose partner left (decision 1),
 * sees `team_entry` — a plain "Join" that opens the Team Event sheet. A player looking for a partner
 * is `interested`: the "You are interested" banner and "Edit response".
 */

export type BottomState =
  /** in_progress / completed: the live screen or results. */
  | { kind: 'live'; completed: boolean }
  /** The organizer's own actions: Start event from the scheduled time and their player states (UX-MEVT-01). */
  | { kind: 'organizer' }
  /** A pending invitation: inviter + Decline / Accept (UX-JEVT-03). */
  | { kind: 'invited' }
  /** Open for joining: Join, with the countdown on the left only inside its 24h window. */
  | { kind: 'open'; countdown: boolean }
  /**
   * A Join would be queued: "No more spots available" (or, with spots free but others already
   * waiting — `waitersAhead` — "Others are already waiting") + Join waiting list (decision 4).
   */
  | { kind: 'full'; waitersAhead: boolean }
  /** On the waiting list: a secondary "Leave waiting list". */
  | { kind: 'waiting_list' }
  /** On the waiting list AND a spot is free for the viewer: primary "Confirm spot" (decision 4). */
  | { kind: 'claim' }
  /** Confirmed (or standby): nothing — leaving lives in the ⋯ sheet. */
  | { kind: 'going' }
  /** Team event, not paired yet: "Join", which opens the Team Event sheet (UX-JEVT-09). */
  | { kind: 'team_entry' }
  /** Team event, looking for a partner: the interested line + "Edit response" (UX-JEVT-13). */
  | { kind: 'interested' }
  /** Past the join cut-off, or cancelled: a static "Event closed" line. */
  | { kind: 'closed' };

export type BannerState = 'going' | 'standby' | 'waiting_list' | 'interested' | null;

export type ViewerInput = {
  status: string;
  specification: string;
  isOrganizer: boolean;
  me: { status: string; is_standby: boolean } | null;
  hasInvite: boolean;
  joinClosed: boolean;
  /**
   * A Join by this viewer would land on the waiting list: `joinWaitlistReason(...) != null` — capacity
   * reached, or someone already waiting ahead of them (decision 4).
   */
  full: boolean;
  /** `joinWaitlistReason(...) === 'waiters'`: spots are free, but others are already waiting. */
  waitersAhead?: boolean;
  /** `showJoinCountdown(joinCutoffMs, now)`. */
  countdown: boolean;
  /** `canClaimWaitlistSpot(...)` — only read while the viewer is on the waiting list. */
  claimable?: boolean;
};

export function bottomState(v: ViewerInput): BottomState {
  if (v.status === 'in_progress' || v.status === 'completed') {
    return { kind: 'live', completed: v.status === 'completed' };
  }
  if (v.isOrganizer) return { kind: 'organizer' };
  if (v.status !== 'scheduled') return { kind: 'closed' };
  if (v.me) {
    if (v.me.status === 'waiting_list') {
      // The claim closes with joining (claim_waitlist_spot refuses event_closed past the cut-off).
      return v.claimable && !v.joinClosed ? { kind: 'claim' } : { kind: 'waiting_list' };
    }
    // Past the cut-off an interested player can no longer pair (every pairing RPC refuses
    // event_closed), so "Edit response" would only lead to errors.
    if (v.me.status === 'interested') return v.joinClosed ? { kind: 'closed' } : { kind: 'interested' };
    // Explicit, so a status this table does not know never strips the viewer of every action.
    if (v.me.status === 'confirmed') return { kind: 'going' };
  }
  // Below: no roster row, or an 'invited' one — a lone team occupant placed by the organizer. Either
  // way they hold no spot and enter like anyone else (decision 1: a partner who stays goes back to
  // the team entry state with Join). Such a row may still sit alone in an event_teams slot; 0113
  // makes the pairing RPCs clear that lone slot and has _is_paired_or_waiting count only full
  // teams, so Join → choose_partner / request_partner works for them rather than already_joined.
  if (v.joinClosed) return { kind: 'closed' };
  if (v.hasInvite) return { kind: 'invited' };
  if (v.specification === 'team') return { kind: 'team_entry' };
  if (v.full) return { kind: 'full', waitersAhead: v.waitersAhead === true };
  return { kind: 'open', countdown: v.countdown };
}

/** The strip under the header. Shown to an organizer who plays as well. */
export function bannerState(status: string, me: { status: string; is_standby: boolean } | null): BannerState {
  if (me == null || status === 'cancelled') return null;
  if (me.status === 'waiting_list') return status === 'scheduled' ? 'waiting_list' : null;
  if (me.status === 'confirmed') return me.is_standby ? 'standby' : 'going';
  if (me.status === 'interested') return status === 'scheduled' ? 'interested' : null;
  return null;
}

/**
 * Leave event appears in the ⋯ sheet only for a player holding a place (UX-JEVT-06). The organizer
 * who also plays gets it too, but only before the deadline — after it they remove themselves from
 * Manage (organizer override), not by messaging themselves.
 */
export function canLeave(
  status: string,
  me: { status: string } | null,
  isOrganizer: boolean,
  leaveLocked: boolean,
): boolean {
  if (status !== 'scheduled' || me == null) return false;
  if (me.status !== 'confirmed' && me.status !== 'interested' && me.status !== 'invited') return false;
  return !(isOrganizer && leaveLocked);
}

export type ClaimParticipant = {
  id: string;
  status: string;
  guest_gender?: string | null;
  pair_participant_id?: string | null;
  profiles?: { gender?: string | null } | null;
};

/**
 * Could the viewer claim a spot from the waiting list right now? The client twin of
 * `_waiter_can_claim` (0112), so the button appears for exactly the waiters the server notifies:
 *   team  — only a waiting PAIR claims, and it needs two free spots;
 *   mixed — the viewer's gender must be known and their half (capacity / 2) not full;
 *   else  — one free spot.
 * Free spots are the total capacity (regular + stand-by) minus every confirmed row, as the server
 * counts them. The server still decides: a lost race answers spot_taken / gender_full.
 *
 * Blind spot on mixed events: the roster reaches the client through RLS, so a player the viewer
 * has blocked (or is blocked by) may be missing, or arrive without a readable gender. Their row
 * then does not count toward a half here, and the button can show when that half is in fact full.
 * That is acceptable: the server counts every row and answers gender_full, shown as a banner.
 */
export function canClaimWaitlistSpot(
  specification: string,
  capacity: number,
  participants: readonly ClaimParticipant[],
  me: ClaimParticipant | null,
): boolean {
  if (me == null || me.status !== 'waiting_list') return false;
  const confirmed = participants.filter((p) => p.status === 'confirmed');
  const free = capacity - confirmed.length;
  if (specification === 'team') {
    const partner = participants.find((p) => p.id === me.pair_participant_id);
    return partner != null && partner.status === 'waiting_list' && free >= 2;
  }
  if (specification === 'mixed') {
    const gender = genderOf(me);
    if (gender == null || free < 1) return false;
    const sameGender = confirmed.filter((p) => genderOf(p) === gender).length;
    return sameGender < Math.floor(capacity / 2);
  }
  return free >= 1;
}

/** Why a Join would land on the waiting list: no room, or room but others already waiting. */
export type JoinWaitlistReason = 'capacity' | 'waiters' | null;

/**
 * Would a Join by a viewer who holds no spot land on the waiting list, and why? The client twin of
 * the waiting-list branch of `join_event` / `choose_partner` (migration 0112), so the bottom area
 * says "Join waiting list" exactly when the server would queue the viewer rather than confirm them:
 *   every event — the confirmed players have reached the total capacity (regular + stand-by);
 *   classic     — anyone is waiting (decision 4: newcomers queue behind waiters, `_has_waiters`);
 *   mixed       — the viewer's half is full (`capacity`), or a waiter of the viewer's gender exists
 *                 (a woman waiting cannot take a man's spot). With no known gender every waiter
 *                 counts, as `_has_waiters(event, null)` does (the server answers gender_required);
 *   team        — no room for two (`capacity`), or a waiting PAIR exists (only pairs claim). This
 *                 branch mirrors the server, but `bottomState` routes team events to `team_entry`
 *                 before it reads `full`, so the team answer does not change the bottom area today.
 *
 * Same RLS blind spot as `canClaimWaitlistSpot`: a hidden row is not counted, so the label can say
 * "Join" when the server queues — the Join result then shows the waiting-list feedback.
 */
export function joinWaitlistReason(
  specification: string,
  capacity: number,
  participants: readonly ClaimParticipant[],
  viewerGender: string | null | undefined,
): JoinWaitlistReason {
  const confirmed = participants.filter((p) => p.status === 'confirmed');
  const waiting = participants.filter((p) => p.status === 'waiting_list');
  if (confirmed.length >= capacity) return 'capacity';
  if (specification === 'team') {
    if (confirmed.length + 2 > capacity) return 'capacity';
    return waiting.some((p) => p.pair_participant_id != null) ? 'waiters' : null;
  }
  if (specification === 'mixed' && viewerGender != null) {
    const sameGender = confirmed.filter((p) => genderOf(p) === viewerGender).length;
    if (sameGender >= Math.floor(capacity / 2)) return 'capacity';
    return waiting.some((p) => genderOf(p) === viewerGender) ? 'waiters' : null;
  }
  return waiting.length > 0 ? 'waiters' : null;
}

function genderOf(p: ClaimParticipant): string | null {
  return p.profiles?.gender ?? p.guest_gender ?? null;
}
