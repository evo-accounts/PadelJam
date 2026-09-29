/**
 * Manage players (UX-MEVT-10..13, 25): which rows go on which tab, what the organizer may do to
 * each, and the per-side counts of a mixed event. Pure, so the rules are unit-tested rather than
 * eyeballed on a simulator; the screen only renders what this returns.
 *
 *   Confirmed    — regular players first, then stand-by, each in the order they joined. The tab
 *                  label is the ratio to the TOTAL capacity (courts × 4 + stand-by spots).
 *   Waiting list — queue order (`waiting_list_position`). Shown once the event is full or while
 *                  anyone is queued (UX-MEVT-12). Remove only: the organizer never confirms a
 *                  waiting player (plan D2 — `organizer_mark_confirmed` refuses it).
 *   Invited      — roster rows still `invited`, then the pending invitations without a row
 *                  (`event_invited_players`).
 *
 * Mixed events (UX-MEVT-25): half the spots belong to each side, `floor(capacity / 2)` — the same
 * rounding as the server's `_mixed_gender_full`, stand-by included.
 */

export type ManageSide = 'female' | 'male';

export type ManageEvent = {
  num_courts: number;
  allow_standby: boolean | null;
  standby_spots: number | null;
  specification: string | null;
  group_id: string | null;
  is_private: boolean | null;
};

export type ManageParticipant = {
  id: string;
  user_id: string | null;
  status: string;
  is_standby: boolean;
  waiting_list_position: number | null;
  guest_name: string | null;
  guest_gender: string | null;
  profiles: { id: string; full_name: string | null; avatar_url: string | null; gender?: string | null } | null;
};

export type ManageInvitation = {
  invitation_id: string;
  user_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  invitee_name: string | null;
};

export type ManageRow = {
  key: string;
  /** The roster row; null for a pending invitation that has none yet. */
  participantId: string | null;
  /** The account; null for a guest or a manual invitee (no profile to open). */
  userId: string | null;
  name: string | null;
  avatarPath: string | null;
  guest: boolean;
  standby: boolean;
  /** Mixed events: which side the player counts towards; null when unknown. */
  side: ManageSide | null;
};

export type ManageRoster = {
  capacity: number;
  /** Spots per side on a mixed event; null otherwise. */
  perSide: number | null;
  confirmed: ManageRow[];
  waiting: ManageRow[];
  invited: ManageRow[];
  /** Confirmed players per side on a mixed event; null otherwise. */
  sideCounts: Record<ManageSide, number> | null;
  full: boolean;
  /** UX-MEVT-12: the Waiting list tab appears once the event is full or anyone is queued. */
  showWaiting: boolean;
};

const asSide = (g: string | null | undefined): ManageSide | null => (g === 'female' || g === 'male' ? g : null);

export function eventCapacityOf(e: ManageEvent): number {
  return Math.max(0, e.num_courts) * 4 + (e.allow_standby ? Math.max(0, e.standby_spots ?? 0) : 0);
}

/** A public group event: every member may join directly, so there is no invited state (D3). */
export function isPublicGroupEvent(e: Pick<ManageEvent, 'group_id' | 'is_private'>): boolean {
  return e.group_id != null && !e.is_private;
}

/** The header's action (UX-MEVT-13): "+ Add manually" on a public group event, "+ Invite" otherwise. */
export function headerAction(e: Pick<ManageEvent, 'group_id' | 'is_private'>): 'add_manual' | 'invite' {
  return isPublicGroupEvent(e) ? 'add_manual' : 'invite';
}

/** The remove sheet's options for a confirmed player (UX-MEVT-10, D3). */
export function removeModes(e: Pick<ManageEvent, 'group_id' | 'is_private'>): ('to_invited' | 'from_event')[] {
  return isPublicGroupEvent(e) ? ['from_event'] : ['to_invited', 'from_event'];
}

function participantRow(p: ManageParticipant): ManageRow {
  return {
    key: p.id,
    participantId: p.id,
    userId: p.user_id,
    name: p.profiles?.full_name ?? p.guest_name ?? null,
    avatarPath: p.profiles?.avatar_url ?? null,
    guest: p.user_id == null,
    standby: p.status === 'confirmed' && p.is_standby,
    side: asSide(p.user_id == null ? p.guest_gender : (p.profiles?.gender ?? p.guest_gender)),
  };
}

export function manageRoster(
  event: ManageEvent,
  participants: readonly ManageParticipant[],
  invitations: readonly ManageInvitation[],
): ManageRoster {
  const capacity = eventCapacityOf(event);
  const mixed = event.specification === 'mixed';

  const confirmed = participants
    .filter((p) => p.status === 'confirmed')
    // Stable: the joined order the list arrives in is kept inside each group.
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(a.p.is_standby) - Number(b.p.is_standby) || a.i - b.i)
    .map(({ p }) => participantRow(p));

  const waiting = participants
    .filter((p) => p.status === 'waiting_list')
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        (a.p.waiting_list_position ?? Number.MAX_SAFE_INTEGER) -
          (b.p.waiting_list_position ?? Number.MAX_SAFE_INTEGER) || a.i - b.i,
    )
    .map(({ p }) => participantRow(p));

  const invited: ManageRow[] = [
    ...participants.filter((p) => p.status === 'invited').map(participantRow),
    ...invitations.map((i) => ({
      key: i.invitation_id,
      participantId: null,
      userId: i.user_id,
      name: i.full_name ?? i.invitee_name,
      avatarPath: i.avatar_url,
      guest: false,
      standby: false,
      side: null,
    })),
  ];

  const sideCounts = mixed
    ? {
        female: confirmed.filter((r) => r.side === 'female').length,
        male: confirmed.filter((r) => r.side === 'male').length,
      }
    : null;
  const full = capacity > 0 && confirmed.length >= capacity;

  return {
    capacity,
    perSide: mixed ? Math.floor(capacity / 2) : null,
    confirmed,
    waiting,
    invited,
    sideCounts,
    full,
    showWaiting: full || waiting.length > 0,
  };
}

/**
 * The rows of one side of a mixed event's Confirmed tab. A player with no gender on record (only
 * possible for a playing organizer who never set one) counts towards neither side, so they are
 * listed on both rather than vanish from the roster.
 */
export function rowsOfSide(rows: readonly ManageRow[], side: ManageSide): ManageRow[] {
  return rows.filter((r) => r.side === side || r.side == null);
}

/** What the organizer may do to an Invited row (UX-MEVT-10). */
export function invitedActions(
  row: ManageRow,
  opts: { team: boolean },
): { confirm: boolean; remove: boolean } {
  return {
    // A manual invitee (no account) cannot be confirmed: a guest is added with "Add manually".
    // Team events place the player in a team first — that is M3's team management (UX-MEVT-14).
    confirm: !opts.team && row.userId != null,
    // organizer_remove_participant needs a roster row; a pending invitation without one has no
    // organizer RPC to withdraw it yet (direct writes to event_invitations are revoked since 0122).
    remove: row.participantId != null,
  };
}

/**
 * Error code → event-namespace copy key, for the organizer's roster actions. The generic codes
 * share the player-facing copy; `gender_full` is reworded, since here it is not "your" gender.
 */
export function rosterErrorKey(code: string): string {
  switch (code) {
    case 'gender_full':
      return 'mpSideFull';
    case 'guest_gender_required':
    case 'player_gender_required':
      return 'mpGenderRequired';
    case 'name_required':
      return 'manualNameRequired';
    default:
      return code;
  }
}
