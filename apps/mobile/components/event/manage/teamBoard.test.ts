import { describe, expect, it } from 'vitest';

import type { ManageEvent, ManageInvitation, ManageParticipant } from './manageRoster';
import {
  matchesName,
  needsConfirmStep,
  occupancyOf,
  openSlotsOf,
  selectCandidates,
  switchCandidates,
  teamBoard,
  teamCountOf,
  teamOfParticipant,
  teamsWithOpenSlot,
  type TeamSlotRow,
} from './teamBoard';

const ev = (over: Partial<ManageEvent> = {}): ManageEvent => ({
  num_courts: 1,
  allow_standby: false,
  standby_spots: null,
  specification: 'team',
  group_id: null,
  is_private: true,
  ...over,
});

let n = 0;
const p = (over: Partial<ManageParticipant> = {}): ManageParticipant => {
  n += 1;
  return {
    id: `p${n}`,
    user_id: `u${n}`,
    status: 'confirmed',
    is_standby: false,
    waiting_list_position: null,
    guest_name: null,
    guest_gender: null,
    profiles: { id: `u${n}`, full_name: `Player ${n}`, avatar_url: null },
    ...over,
  };
};
const team = (num: number, a: ManageParticipant | null, b: ManageParticipant | null): TeamSlotRow => ({
  id: `t${num}`,
  team_number: num,
  player_a: a ? { id: a.id } : null,
  player_b: b ? { id: b.id } : null,
});
const inv = (over: Partial<ManageInvitation> = {}): ManageInvitation => ({
  invitation_id: `i${++n}`,
  user_id: `u${n}`,
  full_name: `Invitee ${n}`,
  avatar_url: null,
  invitee_name: null,
  ...over,
});

describe('teamCountOf (0127 _organizer_team_count)', () => {
  it('is two a court, stand-by pairs included, and never hides an existing team', () => {
    expect(teamCountOf(ev({ num_courts: 2 }), [])).toBe(4);
    expect(teamCountOf(ev({ allow_standby: true, standby_spots: 2 }), [])).toBe(3);
    expect(teamCountOf(ev({ allow_standby: false, standby_spots: 2 }), [])).toBe(2);
    expect(teamCountOf(ev(), [{ team_number: 5 }])).toBe(5);
  });
});

describe('teamBoard (UX-MEVT-14, 26)', () => {
  it('fills every team 1..N, counts open slots, half-formed and complete teams', () => {
    const [a, b, c] = [p(), p(), p({ status: 'invited' })];
    const board = teamBoard(ev({ num_courts: 2 }), [a, b, c], [team(1, a, b), team(3, null, c)]);
    expect(board.teams.map((t) => t.number)).toEqual([1, 2, 3, 4]);
    expect(board.teams[0]).toMatchObject({ complete: true, half: false });
    expect(board.teams[2]).toMatchObject({ complete: false, half: true });
    expect(board.teams[2]!.b?.name).toBe(c.profiles!.full_name);
    expect(board.openSlots).toBe(5);
    expect(board.openInHalfTeams).toBe(1);
    expect(board.completeTeams).toBe(1);
  });

  it('lists confirmed players without a team, then interested ones — nobody else', () => {
    const seatedA = p();
    const seatedB = p();
    const guest = p({ user_id: null, profiles: null, guest_name: 'Gil' });
    const keen = p({ status: 'interested' });
    const invited = p({ status: 'invited' });
    const waiting = p({ status: 'waiting_list', waiting_list_position: 1 });
    const board = teamBoard(ev(), [keen, seatedA, guest, invited, waiting, seatedB], [team(1, seatedA, seatedB)]);
    expect(board.unassigned.map((u) => u.participantId)).toEqual([guest.id, keen.id]);
    expect(board.unassigned[0]).toMatchObject({ guest: true, name: 'Gil' });
  });

  it('ignores a slot whose participant is not on the roster (a stale read)', () => {
    const a = p();
    const board = teamBoard(ev(), [a], [{ id: 't1', team_number: 1, player_a: { id: 'gone' }, player_b: { id: a.id } }]);
    expect(board.teams[0]!.a).toBeNull();
    expect(board.teams[0]!.half).toBe(true);
  });

  it('open slots, occupancy and the teams a Confirm sheet offers', () => {
    const [a, b, c] = [p(), p(), p()];
    const board = teamBoard(ev({ num_courts: 2 }), [a, b, c], [team(1, a, b), team(2, null, c)]);
    expect(openSlotsOf(board.teams[0]!)).toEqual([]);
    expect(openSlotsOf(board.teams[1]!)).toEqual(['a']);
    expect(openSlotsOf(board.teams[2]!)).toEqual(['a', 'b']);
    expect(occupancyOf(board.teams[1]!)).toBe(1);
    expect(teamsWithOpenSlot(board).map((t) => t.number)).toEqual([2, 3, 4]);
    expect(teamOfParticipant(board, c.id)?.number).toBe(2);
    expect(teamOfParticipant(board, 'nobody')).toBeNull();
  });
});

describe('selectCandidates (UX-MEVT-15)', () => {
  it('confirmed, interested, invited rows, invitations with an account, then the queue — nobody seated', () => {
    const [sa, sb] = [p(), p()];
    const conf = p();
    const keen = p({ status: 'interested' });
    const invRow = p({ status: 'invited' });
    const w2 = p({ status: 'waiting_list', waiting_list_position: 2 });
    const w1 = p({ status: 'waiting_list', waiting_list_position: 1 });
    const i1 = inv();
    const manual = inv({ user_id: null, full_name: null, invitee_name: 'Manual' });
    const board = teamBoard(ev(), [sa, sb, conf, keen, invRow, w2, w1], [team(1, sa, sb)]);
    const list = selectCandidates([sa, sb, conf, keen, invRow, w2, w1], [i1, manual], board);
    expect(list.map((c) => [c.kind, c.key])).toEqual([
      ['confirmed', conf.id],
      ['interested', keen.id],
      ['invited', invRow.id],
      ['invited', i1.invitation_id],
      ['waiting', w1.id],
      ['waiting', w2.id],
    ]);
    expect(list[3]).toMatchObject({ participantId: null, userId: i1.user_id });
  });
});

describe('switchCandidates (UX-MEVT-15)', () => {
  it("other teams' players with their team, then invited and the queue — never the own team", () => {
    const [a, b, c, d] = [p(), p(), p(), p()];
    const invRow = p({ status: 'invited' });
    const keen = p({ status: 'interested' });
    const w = p({ status: 'waiting_list', waiting_list_position: 1 });
    const i1 = inv();
    const all = [a, b, c, d, invRow, keen, w];
    const board = teamBoard(ev({ num_courts: 2 }), all, [team(1, a, b), team(2, c, null), team(3, null, d)]);
    const list = switchCandidates(all, [i1], board, a.id);
    expect(list.map((x) => [x.kind, x.key, x.team])).toEqual([
      ['team', c.id, 2],
      ['team', d.id, 3],
      ['invited', invRow.id, null],
      ['invited', i1.invitation_id, null],
      ['waiting', w.id, null],
    ]);
  });
});

describe('helpers', () => {
  it('matches names ignoring case and accents', () => {
    expect(matchesName('João Pereira', 'joao')).toBe(true);
    expect(matchesName('Ana', '  ')).toBe(true);
    expect(matchesName(null, 'x')).toBe(false);
    expect(matchesName('Rita', 'ana')).toBe(false);
  });
  it('asks before placing anyone who is not confirmed', () => {
    expect(needsConfirmStep({ kind: 'confirmed' })).toBe(false);
    expect(needsConfirmStep({ kind: 'team' })).toBe(false);
    expect(needsConfirmStep({ kind: 'interested' })).toBe(true);
    expect(needsConfirmStep({ kind: 'invited' })).toBe(true);
    expect(needsConfirmStep({ kind: 'waiting' })).toBe(true);
  });
});
