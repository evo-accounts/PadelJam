import { describe, expect, it } from 'vitest';

import {
  eventCapacityOf,
  headerAction,
  invitedActions,
  manageRoster,
  removeModes,
  rosterErrorKey,
  rowsOfSide,
  type ManageEvent,
  type ManageParticipant,
} from './manageRoster';

const ev = (over: Partial<ManageEvent> = {}): ManageEvent => ({
  num_courts: 2,
  allow_standby: false,
  standby_spots: null,
  specification: 'classic',
  group_id: 'g1',
  is_private: false,
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
    profiles: { id: `u${n}`, full_name: `Player ${n}`, avatar_url: null, gender: 'male' },
    ...over,
  };
};

describe('eventCapacityOf', () => {
  it('counts four a court plus stand-by spots only when stand-by is on', () => {
    expect(eventCapacityOf(ev())).toBe(8);
    expect(eventCapacityOf(ev({ allow_standby: true, standby_spots: 2 }))).toBe(10);
    expect(eventCapacityOf(ev({ allow_standby: false, standby_spots: 2 }))).toBe(8);
  });
});

describe('header action and remove modes (UX-MEVT-10/13, D3)', () => {
  it('a public group event adds manually and removes from the event only', () => {
    expect(headerAction(ev())).toBe('add_manual');
    expect(removeModes(ev())).toEqual(['from_event']);
  });
  it('a private group event and a group-less event invite and offer both removals', () => {
    expect(headerAction(ev({ is_private: true }))).toBe('invite');
    expect(headerAction(ev({ group_id: null, is_private: true }))).toBe('invite');
    expect(removeModes(ev({ is_private: true }))).toEqual(['to_invited', 'from_event']);
    expect(removeModes(ev({ group_id: null, is_private: false }))).toEqual(['to_invited', 'from_event']);
  });
});

describe('manageRoster', () => {
  it('puts stand-by after the regular players and keeps the joined order', () => {
    const a = p({ is_standby: true });
    const b = p();
    const c = p();
    const r = manageRoster(ev(), [a, b, c], []);
    expect(r.confirmed.map((x) => x.key)).toEqual([b.id, c.id, a.id]);
    expect(r.confirmed[2]!.standby).toBe(true);
  });

  it('orders the waiting list by queue position and shows the tab only when full or queued', () => {
    const w1 = p({ status: 'waiting_list', waiting_list_position: 2 });
    const w2 = p({ status: 'waiting_list', waiting_list_position: 1 });
    const r = manageRoster(ev(), [p(), w1, w2], []);
    expect(r.waiting.map((x) => x.key)).toEqual([w2.id, w1.id]);
    expect(r.showWaiting).toBe(true);
    expect(r.full).toBe(false);

    expect(manageRoster(ev(), [p()], []).showWaiting).toBe(false);
    const full = manageRoster(ev({ num_courts: 1 }), [p(), p(), p(), p()], []);
    expect(full.full).toBe(true);
    expect(full.showWaiting).toBe(true);
  });

  it('lists invited roster rows, then pending invitations without a row', () => {
    const inv = p({ status: 'invited' });
    const r = manageRoster(ev(), [inv], [
      { invitation_id: 'i1', user_id: 'u99', full_name: 'Ana', avatar_url: null, invitee_name: null },
      { invitation_id: 'i2', user_id: null, full_name: null, avatar_url: null, invitee_name: 'Manual Joe' },
    ]);
    expect(r.invited.map((x) => [x.key, x.participantId, x.name])).toEqual([
      [inv.id, inv.id, inv.profiles!.full_name],
      ['i1', null, 'Ana'],
      ['i2', null, 'Manual Joe'],
    ]);
  });

  it('marks guests and takes a guest side from guest_gender', () => {
    const g = p({ user_id: null, profiles: null, guest_name: 'Zé', guest_gender: 'female' });
    const r = manageRoster(ev({ specification: 'mixed' }), [g], []);
    expect(r.confirmed[0]).toMatchObject({ guest: true, name: 'Zé', side: 'female', userId: null });
  });

  it('splits a mixed event into halves of the capacity, stand-by included (UX-MEVT-25)', () => {
    const woman = p({ profiles: { id: 'w', full_name: 'W', avatar_url: null, gender: 'female' } });
    const man = p();
    const unknown = p({ profiles: { id: 'x', full_name: 'X', avatar_url: null, gender: null } });
    const r = manageRoster(ev({ specification: 'mixed', allow_standby: true, standby_spots: 3 }), [woman, man, unknown], []);
    expect(r.capacity).toBe(11);
    expect(r.perSide).toBe(5);
    expect(r.sideCounts).toEqual({ female: 1, male: 1 });
    expect(rowsOfSide(r.confirmed, 'female').map((x) => x.key)).toEqual([woman.id, unknown.id]);
    expect(rowsOfSide(r.confirmed, 'male').map((x) => x.key)).toEqual([man.id, unknown.id]);
  });

  it('has no split on a classic event', () => {
    const r = manageRoster(ev(), [p()], []);
    expect(r.perSide).toBeNull();
    expect(r.sideCounts).toBeNull();
  });
});

describe('invitedActions', () => {
  const row = { key: 'k', participantId: null, userId: 'u', name: 'A', avatarPath: null, guest: false, standby: false, side: null };
  it('confirms an invitee with an account; removes only a row the RPC can reach', () => {
    expect(invitedActions(row, { team: false })).toEqual({ confirm: true, remove: false });
    expect(invitedActions({ ...row, participantId: 'p' }, { team: false })).toEqual({ confirm: true, remove: true });
  });
  it('never confirms a manual invitee, nor anyone on a team event (M3 places them in a team)', () => {
    expect(invitedActions({ ...row, userId: null }, { team: false }).confirm).toBe(false);
    expect(invitedActions(row, { team: true }).confirm).toBe(false);
  });
});

describe('rosterErrorKey', () => {
  it('rewords the side and gender codes and passes the rest through', () => {
    expect(rosterErrorKey('gender_full')).toBe('mpSideFull');
    expect(rosterErrorKey('guest_gender_required')).toBe('mpGenderRequired');
    expect(rosterErrorKey('name_required')).toBe('manualNameRequired');
    expect(rosterErrorKey('event_full')).toBe('event_full');
  });
});
