/**
 * Team management (UX-MEVT-14, 15, 26): the Teams tab's board and the player lists its sheets
 * offer. Pure, so the rules are unit-tested; the screen only renders what this returns.
 *
 * The server's model (0071 / 0121 / 0127), which the copy has to stay truthful to:
 *   - a team is two slots, a and b. Only a COMPLETE pair holds spots: both are 'confirmed' and
 *     the team is confirmed. A player alone in a team is 'invited' (0071's rule for a lone
 *     occupant) — except a guest placed by the organizer, who stays confirmed (0122, D7);
 *   - 'interested' = wants to play, has no pair yet (invited nobody, or a partner invitation is
 *     still unanswered) and holds no spot;
 *   - the organizer's teams run 1..teamCountOf(event): the regular courts' pairs, the stand-by
 *     pairs, and any team the player flow already numbered past them (it numbers new pairs
 *     max + 1). Same bound as 0127's _organizer_team_count.
 *
 * "Unassigned" (the row at the bottom of the Teams tab) is every confirmed player without a team
 * (a manual guest, a playing organizer), then every interested one — both can be dragged onto an
 * empty slot. Invited and waiting-list players are reached through a slot's "+".
 */
import { eventCapacityOf, type ManageEvent, type ManageInvitation, type ManageParticipant } from './manageRoster';

export type Slot = 'a' | 'b';

export type TeamSlotRow = {
  id: string;
  team_number: number;
  player_a: { id: string } | null;
  player_b: { id: string } | null;
};

export type BoardPlayer = {
  participantId: string;
  userId: string | null;
  name: string | null;
  avatarPath: string | null;
  status: string;
  guest: boolean;
};

export type BoardTeam = {
  number: number;
  a: BoardPlayer | null;
  b: BoardPlayer | null;
  /** Both slots filled. */
  complete: boolean;
  /** Exactly one slot filled — "half-formed" (UX-MEVT-26). */
  half: boolean;
};

export type TeamBoard = {
  teams: BoardTeam[];
  /** Empty slots across every team. */
  openSlots: number;
  /** Open slots that sit in half-formed teams (= the number of half-formed teams). */
  openInHalfTeams: number;
  completeTeams: number;
  /** Confirmed players without a team, then interested ones, each in joined order. */
  unassigned: BoardPlayer[];
};

/** Where a candidate comes from; the order the Select and Switch sheets list them in. */
export type CandidateKind = 'confirmed' | 'interested' | 'invited' | 'waiting' | 'team';

export type Candidate = {
  key: string;
  kind: CandidateKind;
  /** The roster row; null for a pending invitation that has none. */
  participantId: string | null;
  userId: string | null;
  name: string | null;
  avatarPath: string | null;
  guest: boolean;
  /** kind 'team': the team they are in now. */
  team: number | null;
};

export function teamCountOf(event: ManageEvent, teams: readonly Pick<TeamSlotRow, 'team_number'>[]): number {
  const highest = teams.reduce((m, t) => Math.max(m, t.team_number), 0);
  return Math.max(Math.max(0, event.num_courts) * 2, Math.floor(eventCapacityOf(event) / 2), highest);
}

function boardPlayer(p: ManageParticipant): BoardPlayer {
  return {
    participantId: p.id,
    userId: p.user_id,
    name: p.profiles?.full_name ?? p.guest_name ?? null,
    avatarPath: p.profiles?.avatar_url ?? null,
    status: p.status,
    guest: p.user_id == null,
  };
}

export function teamBoard(
  event: ManageEvent,
  participants: readonly ManageParticipant[],
  teams: readonly TeamSlotRow[],
): TeamBoard {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const seat = (s: { id: string } | null): BoardPlayer | null => {
    const p = s ? byId.get(s.id) : undefined;
    return p ? boardPlayer(p) : null;
  };
  const count = teamCountOf(event, teams);
  const rows = new Map(teams.map((t) => [t.team_number, t]));
  const board: BoardTeam[] = [];
  for (let n = 1; n <= count; n++) {
    const row = rows.get(n);
    const a = seat(row?.player_a ?? null);
    const b = seat(row?.player_b ?? null);
    board.push({ number: n, a, b, complete: a != null && b != null, half: (a == null) !== (b == null) });
  }
  const seated = new Set(board.flatMap((t) => [t.a?.participantId, t.b?.participantId]).filter(Boolean));
  const free = participants.filter((p) => !seated.has(p.id));
  return {
    teams: board,
    openSlots: board.reduce((n, t) => n + (t.a ? 0 : 1) + (t.b ? 0 : 1), 0),
    openInHalfTeams: board.filter((t) => t.half).length,
    completeTeams: board.filter((t) => t.complete).length,
    unassigned: [
      ...free.filter((p) => p.status === 'confirmed').map(boardPlayer),
      ...free.filter((p) => p.status === 'interested').map(boardPlayer),
    ],
  };
}

/** The slots of a team still free, a before b. */
export function openSlotsOf(team: Pick<BoardTeam, 'a' | 'b'>): Slot[] {
  return [...(team.a ? [] : (['a'] as Slot[])), ...(team.b ? [] : (['b'] as Slot[]))];
}

/** Teams with at least one open slot — the Interested / Invited "Confirm" sheet (UX-MEVT-14). */
export function teamsWithOpenSlot(board: TeamBoard): BoardTeam[] {
  return board.teams.filter((t) => openSlotsOf(t).length > 0);
}

/** How many players a team holds, for "Team 2 · 1/2". */
export function occupancyOf(team: Pick<BoardTeam, 'a' | 'b'>): number {
  return (team.a ? 1 : 0) + (team.b ? 1 : 0);
}

function fromParticipant(p: ManageParticipant, kind: CandidateKind, team: number | null = null): Candidate {
  const b = boardPlayer(p);
  return { key: p.id, kind, participantId: p.id, userId: b.userId, name: b.name, avatarPath: b.avatarPath, guest: b.guest, team };
}

function fromInvitation(i: ManageInvitation): Candidate {
  return {
    key: i.invitation_id,
    kind: 'invited',
    participantId: null,
    userId: i.user_id,
    name: i.full_name ?? i.invitee_name,
    avatarPath: i.avatar_url,
    guest: false,
    team: null,
  };
}

const byQueue = (a: ManageParticipant, b: ManageParticipant) =>
  (a.waiting_list_position ?? Number.MAX_SAFE_INTEGER) - (b.waiting_list_position ?? Number.MAX_SAFE_INTEGER);

/**
 * Who the Select player sheet offers (UX-MEVT-15): everyone not in a team — confirmed, interested,
 * invited (a roster row or only a pending invitation) and the waiting list. A manual invitee with
 * no account cannot be placed (no one to confirm), so pending invitations need a user.
 */
export function selectCandidates(
  participants: readonly ManageParticipant[],
  invitations: readonly ManageInvitation[],
  board: TeamBoard,
): Candidate[] {
  const seated = seatedIds(board);
  const free = participants.filter((p) => !seated.has(p.id));
  return [
    ...free.filter((p) => p.status === 'confirmed').map((p) => fromParticipant(p, 'confirmed')),
    ...free.filter((p) => p.status === 'interested').map((p) => fromParticipant(p, 'interested')),
    ...free.filter((p) => p.status === 'invited').map((p) => fromParticipant(p, 'invited')),
    ...invitations.filter((i) => i.user_id != null).map(fromInvitation),
    ...free
      .filter((p) => p.status === 'waiting_list')
      .sort(byQueue)
      .map((p) => fromParticipant(p, 'waiting')),
  ];
}

/**
 * Who the Switch player sheet offers for `participantId` (UX-MEVT-15): the players of OTHER teams,
 * then invited players and the waiting list. Confirmed / interested players without a team are
 * not listed — placing them is the "+" / drag-and-drop's job, not a switch.
 */
export function switchCandidates(
  participants: readonly ManageParticipant[],
  invitations: readonly ManageInvitation[],
  board: TeamBoard,
  participantId: string,
): Candidate[] {
  const own = board.teams.find((t) => t.a?.participantId === participantId || t.b?.participantId === participantId);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const inTeams: Candidate[] = [];
  for (const t of board.teams) {
    if (t.number === own?.number) continue;
    for (const s of [t.a, t.b]) {
      const p = s ? byId.get(s.participantId) : undefined;
      if (p) inTeams.push(fromParticipant(p, 'team', t.number));
    }
  }
  const seated = seatedIds(board);
  const free = participants.filter((p) => !seated.has(p.id));
  return [
    ...inTeams,
    ...free.filter((p) => p.status === 'invited').map((p) => fromParticipant(p, 'invited')),
    ...invitations.filter((i) => i.user_id != null).map(fromInvitation),
    ...free
      .filter((p) => p.status === 'waiting_list')
      .sort(byQueue)
      .map((p) => fromParticipant(p, 'waiting')),
  ];
}

function seatedIds(board: TeamBoard): Set<string> {
  const ids = new Set<string>();
  for (const t of board.teams) {
    if (t.a) ids.add(t.a.participantId);
    if (t.b) ids.add(t.b.participantId);
  }
  return ids;
}

/** A case- and accent-insensitive name filter for the sheets' search. */
export function matchesName(name: string | null, query: string): boolean {
  const q = fold(query.trim());
  return q.length === 0 || fold(name ?? '').includes(q);
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Placing this candidate confirms nobody on its own until the pair is complete — ask first. */
export function needsConfirmStep(c: Pick<Candidate, 'kind'>): boolean {
  return c.kind !== 'confirmed' && c.kind !== 'team';
}

/** The team a participant sits in, if any. */
export function teamOfParticipant(board: TeamBoard, participantId: string): BoardTeam | null {
  return board.teams.find((t) => t.a?.participantId === participantId || t.b?.participantId === participantId) ?? null;
}
