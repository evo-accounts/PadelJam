/**
 * What the event screen's fixed bottom area and top banner show for the viewer (UX-JEVT-02..05).
 * Shared by the mobile and web event pages, so both apps answer the same state table.
 *
 * Pure, so the whole state table is unit-tested rather than discovered on a simulator. The screen
 * reads `bottom` for the bottom area and `banner` for the strip under the header; everything else
 * (the ⋯ sheet, the body) is the same in every state.
 *
 * Deliberately NOT here yet (M4b, needs migration 0112): the Pending tab, the waiting-list
 * broadcast/claim CTA, and newcomers queueing behind waiters. Team-event entry and the
 * `interested` state belong to M5; they are routed but not redesigned.
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
};

export function bottomState(v: ViewerInput): BottomState {
  if (v.status === 'in_progress' || v.status === 'completed') {
    return { kind: 'live', completed: v.status === 'completed' };
  }
  if (v.isOrganizer) return { kind: 'organizer' };
  if (v.status !== 'scheduled') return { kind: 'closed' };
  if (v.me) {
    if (v.me.status === 'waiting_list') return { kind: 'waiting_list' };
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
