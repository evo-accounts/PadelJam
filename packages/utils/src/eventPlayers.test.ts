import { describe, expect, it } from 'vitest';

import { playerTabs, type RosterParticipant } from './eventPlayers';

let n = 0;
const row = (over: Partial<RosterParticipant>): RosterParticipant => {
  n += 1;
  const id = over.id ?? `p${n}`;
  return {
    id,
    user_id: `u-${id}`,
    status: 'confirmed',
    is_standby: false,
    waiting_list_position: null,
    joined_at: `2026-09-2${n % 10}T10:00:00Z`,
    guest_name: null,
    pair_participant_id: null,
    profiles: { id: `u-${id}`, full_name: `Player ${id}`, avatar_url: null },
    ...over,
  };
};

describe('playerTabs', () => {
  it('lists confirmed regulars first, then stand-by, keeping the joined order', () => {
    const tabs = playerTabs(
      [
        row({ id: 's1', is_standby: true }),
        row({ id: 'r1' }),
        row({ id: 'w1', status: 'waiting_list', waiting_list_position: 1 }),
        row({ id: 'r2' }),
      ],
      [],
    );
    expect(tabs.confirmed.map((r) => r.key)).toEqual(['r1', 'r2', 's1']);
    expect(tabs.confirmed.map((r) => r.standby)).toEqual([false, false, true]);
  });

  it('leaves interested and invited-status rows off every tab', () => {
    const tabs = playerTabs([row({ status: 'interested' }), row({ status: 'invited' })], []);
    expect(tabs.confirmed).toEqual([]);
    expect(tabs.waiting).toEqual([]);
  });

  it('tags a guest and gives it no profile to open', () => {
    const [guest] = playerTabs(
      [row({ id: 'g', user_id: null, profiles: null, guest_name: 'Rui (guest)' })],
      [],
    ).confirmed;
    expect(guest).toMatchObject({ guest: true, profileId: null, name: 'Rui (guest)' });
  });

  it('orders the waiting list by position and keeps a waiting pair together', () => {
    const tabs = playerTabs(
      [
        row({ id: 'b', status: 'waiting_list', waiting_list_position: 3, pair_participant_id: 'a' }),
        row({ id: 'solo', status: 'waiting_list', waiting_list_position: 1 }),
        row({ id: 'a', status: 'waiting_list', waiting_list_position: 2, pair_participant_id: 'b' }),
      ],
      [],
    );
    expect(tabs.waiting.map((e) => e.players.map((p) => p.key))).toEqual([['solo'], ['a', 'b']]);
    expect(tabs.waitingCount).toBe(3);
  });

  it('shows a half-pair whose partner is no longer waiting on its own', () => {
    const tabs = playerTabs(
      [row({ id: 'a', status: 'waiting_list', waiting_list_position: 1, pair_participant_id: 'gone' })],
      [],
    );
    expect(tabs.waiting).toEqual([{ key: 'a', players: [expect.objectContaining({ key: 'a' })] }]);
  });

  it('maps invitees, a manual invitee by name with nothing to open', () => {
    const tabs = playerTabs(
      [],
      [
        { invitation_id: 'i1', user_id: 'u1', full_name: 'Ana', avatar_url: 'a.png', invitee_name: null },
        { invitation_id: 'i2', user_id: null, full_name: null, avatar_url: null, invitee_name: 'Zé' },
      ],
    );
    expect(tabs.invited).toEqual([
      { key: 'i1', profileId: 'u1', name: 'Ana', avatarPath: 'a.png', guest: false, standby: false },
      { key: 'i2', profileId: null, name: 'Zé', avatarPath: null, guest: false, standby: false },
    ]);
  });
});
