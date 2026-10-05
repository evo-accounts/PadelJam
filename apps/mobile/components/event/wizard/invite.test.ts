import { describe, expect, it } from 'vitest';

import { defaultDraft, type EventDraft } from './draft';
import { addGuest, draftRoster, guestIssue, invitePayload, removeGuest, togglePlayer, updateGuest } from './invite';

const maria = { id: 'u-maria', full_name: 'Maria', avatar_url: null };

describe('Invite players (UX-CEVT-11)', () => {
  it('ticking a player picks them; ticking again unpicks', () => {
    const once = togglePlayer(undefined, maria);
    expect(once).toEqual([{ invitee_id: 'u-maria', name: 'Maria', avatarUrl: null }]);
    expect(togglePlayer(once, maria)).toEqual([]);
  });

  it('a guest keeps a gender only on a mixed event, and is removed by key', () => {
    const mixed = addGuest(undefined, { name: '  Rui ', gender: 'male' }, 'k1', true);
    expect(mixed).toEqual([{ key: 'k1', name: 'Rui', gender: 'male' }]);
    expect(addGuest(undefined, { name: 'Rui', gender: 'male' }, 'k1', false)).toEqual([{ key: 'k1', name: 'Rui' }]);
    const two = addGuest(mixed, { name: 'Rui', gender: 'male' }, 'k2', true);
    expect(removeGuest(two, 'k1').map((g) => g.key)).toEqual(['k2']);
  });

  it('counts the playing organizer and each guest against the courts', () => {
    const d: EventDraft = { ...defaultDraft, numCourts: 2, guests: [{ key: 'a', name: 'A' }] };
    expect(draftRoster(d).remaining).toBe(6);
  });
});

describe('invitePayload', () => {
  const d: EventDraft = {
    ...defaultDraft,
    groupId: null,
    isPrivate: true,
    specification: 'classic',
    invitees: [{ invitee_id: 'u-maria', name: 'Maria' }],
    guests: [{ key: 'a', name: ' Rui ', gender: 'male' }],
  };

  it('sends picked players as invitees and guests by name', () => {
    expect(invitePayload(d)).toEqual({
      invitees: [{ invitee_id: 'u-maria' }],
      guests: [{ name: 'Rui', gender: null }],
    });
  });

  it('keeps a guest gender on a mixed event', () => {
    expect(invitePayload({ ...d, specification: 'mixed' }).guests).toEqual([{ name: 'Rui', gender: 'male' }]);
  });

  it('"I will invite later" sends nobody', () => {
    expect(invitePayload(d, { later: true })).toEqual({});
  });

  it('a public group event sends nobody, even people picked before it went public (decision 5)', () => {
    expect(invitePayload({ ...d, groupId: 'g1', isPrivate: false })).toEqual({});
  });

  it('omits empty lists', () => {
    expect(invitePayload({ ...d, invitees: [], guests: [] })).toEqual({ invitees: undefined, guests: undefined });
  });
});

describe('guest fixes after going back', () => {
  it('updateGuest sets a missing gender in place', () => {
    const list = [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }];
    expect(updateGuest(list, 'a', { name: ' A ', gender: 'female' }, true)).toEqual([
      { key: 'a', name: 'A', gender: 'female' },
      { key: 'b', name: 'B' },
    ]);
  });

  it('guestIssue names what is wrong: team, then gender, then capacity', () => {
    const d: EventDraft = { ...defaultDraft, numCourts: 1, guests: [{ key: 'a', name: 'A' }] };
    expect(guestIssue({ ...d, specification: 'classic' })).toBeNull();
    expect(guestIssue({ ...d, specification: 'team' })).toBe('team');
    expect(guestIssue({ ...d, specification: 'mixed' }, 'male')).toBe('gender');
    const five = Array.from({ length: 5 }, (_, i) => ({ key: String(i), name: `G${i}` }));
    expect(guestIssue({ ...d, specification: 'classic', guests: five })).toBe('capacity');
  });
});
