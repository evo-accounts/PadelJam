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
 * Team-event entry and the `interested` state belong to M5; they are routed but not redesigned.
 */

export type BottomState =
  /** in_progress / completed: the live screen or results. */
  | { kind: 'live'; completed: boolean }
  /** The organizer's own actions (Manage, Start, Join as a player) — UX-MEVT-01, unchanged. */
  | { kind: 'organizer' }
  /** A pending invitation: inviter + Decline / Accept (UX-JEVT-03). */
  | { kind: 'invited' }
  /** Open for joining: Join, with the countdown on the left only inside its 24h window. */
  | { kind: 'open'; countdown: boolean }
  /** Every spot taken: "No more spots available" + Join waiting list. */
  | { kind: 'full' }
  /** On the waiting list: a secondary "Leave waiting list". */
  | { kind: 'waiting_list' }
  /** On the waiting list AND a spot is free for the viewer: primary "Confirm spot" (decision 4). */
  | { kind: 'claim' }
  /** Confirmed (or standby): nothing — leaving lives in the ⋯ sheet. */
  | { kind: 'going' }
  /** Team event, not in yet: the existing partner flow entry (M5 redesigns it). */
  | { kind: 'team_entry' }
  /** Team event, accepted and looking for a partner, or left `invited` by a partner leaving (M5 redesigns it). */
  | { kind: 'interested' }
  /** Past the join cut-off, or cancelled: a static "Event closed" line. */
  | { kind: 'closed' };

export type BannerState = 'going' | 'standby' | 'waiting_list' | null;

export type ViewerInput = {
  status: string;
  specification: string;
  isOrganizer: boolean;
  me: { status: string; is_standby: boolean } | null;
  hasInvite: boolean;
  joinClosed: boolean;
  /** Confirmed + standby players have reached the total capacity (regular + standby spots). */
  full: boolean;
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
    // 'invited' is a lone team occupant whose partner left or who was placed by the organizer
    // (decision 1): they hold no spot and re-enter through the team flow, like 'interested'.
    if (v.me.status === 'interested' || v.me.status === 'invited') return { kind: 'interested' };
    // Explicit, so a status this table does not know never strips the viewer of every action.
    if (v.me.status === 'confirmed') return { kind: 'going' };
  }
  if (v.joinClosed) return { kind: 'closed' };
  if (v.hasInvite) return { kind: 'invited' };
  if (v.specification === 'team') return { kind: 'team_entry' };
  if (v.full) return { kind: 'full' };
  return { kind: 'open', countdown: v.countdown };
}

/** The strip under the header. Shown to an organizer who plays as well. */
export function bannerState(status: string, me: { status: string; is_standby: boolean } | null): BannerState {
  if (me == null || status === 'cancelled') return null;
  if (me.status === 'waiting_list') return status === 'scheduled' ? 'waiting_list' : null;
  if (me.status === 'confirmed') return me.is_standby ? 'standby' : 'going';
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

function genderOf(p: ClaimParticipant): string | null {
  return p.profiles?.gender ?? p.guest_gender ?? null;
}
