/**
 * The read-only Player list (UX-JEVT-08): which rows go on which tab, in which order.
 *
 * Pure, so the grouping is unit-tested rather than eyeballed on a simulator:
 *   Confirmed — regular players first, then stand-by, each in the order they joined;
 *   Waiting list — by list position; a waiting PAIR (0112, `pair_participant_id`) is one entry
 *                  holding both players, since the pair queues and claims as one unit;
 *   Invited  — pending invitees (`event_invited_players`), already ordered by the server.
 * A guest (no account, `user_id` null) has no profile to open.
 */

export type RosterParticipant = {
  id: string;
  user_id: string | null;
  status: string;
  is_standby: boolean;
  waiting_list_position: number | null;
  joined_at: string;
  guest_name: string | null;
  pair_participant_id?: string | null;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

export type InvitedPlayer = {
  invitation_id: string;
  user_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  invitee_name: string | null;
};

export type PlayerRow = {
  key: string;
  /** The profile a row opens; null for a guest or a manual invitee (no chevron). */
  profileId: string | null;
  name: string | null;
  avatarPath: string | null;
  /** A player the organizer added by name, with no account (decision 7). */
  guest: boolean;
  standby: boolean;
};

export type WaitingEntry = { key: string; players: PlayerRow[] };

export type PlayerTabs = {
  confirmed: PlayerRow[];
  waiting: WaitingEntry[];
  /** Players on the waiting list (a pair counts two), for the tab label. */
  waitingCount: number;
  invited: PlayerRow[];
};

function participantRow(p: RosterParticipant): PlayerRow {
  return {
    key: p.id,
    profileId: p.user_id != null ? (p.profiles?.id ?? p.user_id) : null,
    name: p.profiles?.full_name ?? p.guest_name ?? null,
    avatarPath: p.profiles?.avatar_url ?? null,
    guest: p.user_id == null,
    standby: p.status === 'confirmed' && p.is_standby,
  };
}

export function playerTabs(
  participants: readonly RosterParticipant[],
  invited: readonly InvitedPlayer[],
): PlayerTabs {
  const confirmed = participants
    .filter((p) => p.status === 'confirmed')
    // Stable sort: the joined order the list arrives in is kept inside each group.
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(a.p.is_standby) - Number(b.p.is_standby) || a.i - b.i)
    .map(({ p }) => participantRow(p));

  const waitingRows = participants
    .filter((p) => p.status === 'waiting_list')
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        (a.p.waiting_list_position ?? Number.MAX_SAFE_INTEGER) -
          (b.p.waiting_list_position ?? Number.MAX_SAFE_INTEGER) || a.i - b.i,
    )
    .map(({ p }) => p);
  const byId = new Map(waitingRows.map((p) => [p.id, p]));
  const placed = new Set<string>();
  const waiting: WaitingEntry[] = [];
  for (const p of waitingRows) {
    if (placed.has(p.id)) continue;
    placed.add(p.id);
    const partner = p.pair_participant_id ? byId.get(p.pair_participant_id) : undefined;
    if (partner && !placed.has(partner.id)) {
      placed.add(partner.id);
      waiting.push({ key: `${p.id}+${partner.id}`, players: [participantRow(p), participantRow(partner)] });
    } else {
      waiting.push({ key: p.id, players: [participantRow(p)] });
    }
  }

  return {
    confirmed,
    waiting,
    waitingCount: waitingRows.length,
    invited: invited.map((i) => ({
      key: i.invitation_id,
      profileId: i.user_id,
      name: i.full_name ?? i.invitee_name,
      avatarPath: i.avatar_url,
      guest: false,
      standby: false,
    })),
  };
}
