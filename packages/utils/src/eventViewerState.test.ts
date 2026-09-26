import { describe, expect, it } from 'vitest';

import {
  bannerState,
  bottomState,
  canClaimWaitlistSpot,
  canLeave,
  type ClaimParticipant,
  type ViewerInput,
} from './eventViewerState';

const base: ViewerInput = {
  status: 'scheduled',
  specification: 'classic',
  isOrganizer: false,
  me: null,
  hasInvite: false,
  joinClosed: false,
  full: false,
  countdown: false,
};

describe('bottomState', () => {
  it('offers Join to an outsider, with the countdown only when asked', () => {
    expect(bottomState(base)).toEqual({ kind: 'open', countdown: false });
    expect(bottomState({ ...base, countdown: true })).toEqual({ kind: 'open', countdown: true });
  });

  it('offers the waiting list when every spot is taken', () => {
    expect(bottomState({ ...base, full: true })).toEqual({ kind: 'full' });
  });

  it('shows Event closed past the join cut-off, even to an invitee', () => {
    expect(bottomState({ ...base, joinClosed: true })).toEqual({ kind: 'closed' });
    expect(bottomState({ ...base, joinClosed: true, hasInvite: true })).toEqual({ kind: 'closed' });
  });

  it('shows Event closed on a cancelled event', () => {
    expect(bottomState({ ...base, status: 'cancelled' })).toEqual({ kind: 'closed' });
  });

  it('shows the invitation before capacity or the team flow', () => {
    expect(bottomState({ ...base, hasInvite: true, full: true })).toEqual({ kind: 'invited' });
    expect(bottomState({ ...base, hasInvite: true, specification: 'team' })).toEqual({ kind: 'invited' });
  });

  it('routes an outsider of a team event to the partner flow', () => {
    expect(bottomState({ ...base, specification: 'team' })).toEqual({ kind: 'team_entry' });
  });

  it('carries no leave action for a confirmed player — it lives in the ⋯ sheet', () => {
    expect(bottomState({ ...base, me: { status: 'confirmed', is_standby: false } })).toEqual({ kind: 'going' });
    expect(bottomState({ ...base, me: { status: 'confirmed', is_standby: true } })).toEqual({ kind: 'going' });
  });

  it('keeps a confirmed player on "going" after the join cut-off', () => {
    expect(bottomState({ ...base, joinClosed: true, me: { status: 'confirmed', is_standby: false } })).toEqual({
      kind: 'going',
    });
  });

  it('routes a lone team occupant (status invited) back to the team entry, and an interested one to Edit response', () => {
    expect(bottomState({ ...base, specification: 'team', me: { status: 'invited', is_standby: false } })).toEqual({
      kind: 'team_entry',
    });
    expect(bottomState({ ...base, specification: 'team', me: { status: 'interested', is_standby: false } })).toEqual({
      kind: 'interested',
    });
    // Past the cut-off the lone occupant can no longer pair.
    expect(
      bottomState({ ...base, specification: 'team', joinClosed: true, me: { status: 'invited', is_standby: false } }),
    ).toEqual({ kind: 'closed' });
  });

  it('offers a team event\'s Join even when every spot is taken — the pair queues together', () => {
    expect(bottomState({ ...base, specification: 'team', full: true })).toEqual({ kind: 'team_entry' });
  });

  it('does not treat an unknown participant status as going', () => {
    expect(bottomState({ ...base, me: { status: 'something_new', is_standby: false } })).toEqual({
      kind: 'open',
      countdown: false,
    });
  });

  it('offers Leave waiting list to a waiting player', () => {
    expect(bottomState({ ...base, me: { status: 'waiting_list', is_standby: false } })).toEqual({
      kind: 'waiting_list',
    });
  });

  it('keeps the organizer on their own actions whether or not they play', () => {
    expect(bottomState({ ...base, isOrganizer: true })).toEqual({ kind: 'organizer' });
    expect(bottomState({ ...base, isOrganizer: true, me: { status: 'confirmed', is_standby: false } })).toEqual({
      kind: 'organizer',
    });
  });

  it('sends everyone to the live screen once the event runs', () => {
    expect(bottomState({ ...base, status: 'in_progress', isOrganizer: true })).toEqual({ kind: 'live', completed: false });
    expect(bottomState({ ...base, status: 'completed' })).toEqual({ kind: 'live', completed: true });
  });
});

describe('bannerState', () => {
  it('says "You are going" to a confirmed player, organizer or not', () => {
    expect(bannerState('scheduled', { status: 'confirmed', is_standby: false })).toBe('going');
  });

  it('distinguishes a standby player', () => {
    expect(bannerState('scheduled', { status: 'confirmed', is_standby: true })).toBe('standby');
  });

  it('explains the waiting list only while the event is still open', () => {
    expect(bannerState('scheduled', { status: 'waiting_list', is_standby: false })).toBe('waiting_list');
    expect(bannerState('completed', { status: 'waiting_list', is_standby: false })).toBeNull();
  });

  it('says "You are interested" to a player looking for a partner (UX-JEVT-13)', () => {
    expect(bannerState('scheduled', { status: 'interested', is_standby: false })).toBe('interested');
    expect(bannerState('completed', { status: 'interested', is_standby: false })).toBeNull();
    // A lone occupant whose partner left holds nothing: no banner, the team entry state instead.
    expect(bannerState('scheduled', { status: 'invited', is_standby: false })).toBeNull();
  });

  it('shows nothing to an outsider or on a cancelled event', () => {
    expect(bannerState('scheduled', null)).toBeNull();
    expect(bannerState('cancelled', { status: 'confirmed', is_standby: false })).toBeNull();
  });
});

describe('canLeave', () => {
  it('is offered to a confirmed or interested player on a scheduled event', () => {
    expect(canLeave('scheduled', { status: 'confirmed' }, false, false)).toBe(true);
    expect(canLeave('scheduled', { status: 'interested' }, false, false)).toBe(true);
    expect(canLeave('scheduled', { status: 'invited' }, false, false)).toBe(true);
  });

  it('stays offered to a player past the deadline — it opens the contact-the-organizer sheet', () => {
    expect(canLeave('scheduled', { status: 'confirmed' }, false, true)).toBe(true);
  });

  it('is not offered to a waiting player, an outsider, or once the event runs', () => {
    expect(canLeave('scheduled', { status: 'waiting_list' }, false, false)).toBe(false);
    expect(canLeave('scheduled', null, false, false)).toBe(false);
    expect(canLeave('scheduled', { status: 'something_new' }, false, false)).toBe(false);
    expect(canLeave('in_progress', { status: 'confirmed' }, false, false)).toBe(false);
  });

  it('is withdrawn from a playing organizer past the deadline', () => {
    expect(canLeave('scheduled', { status: 'confirmed' }, true, false)).toBe(true);
    expect(canLeave('scheduled', { status: 'confirmed' }, true, true)).toBe(false);
  });
});

describe('bottomState — waiting-list claim (decision 4)', () => {
  const waiting = { status: 'waiting_list', is_standby: false };

  it('offers Confirm spot to a waiter when a spot is claimable', () => {
    expect(bottomState({ ...base, me: waiting, full: true, claimable: true })).toEqual({ kind: 'claim' });
  });

  it('keeps Leave waiting list when nothing is claimable', () => {
    expect(bottomState({ ...base, me: waiting, full: true })).toEqual({ kind: 'waiting_list' });
    expect(bottomState({ ...base, me: waiting, claimable: false })).toEqual({ kind: 'waiting_list' });
  });

  it('never offers the claim past the join cut-off', () => {
    expect(bottomState({ ...base, me: waiting, claimable: true, joinClosed: true })).toEqual({
      kind: 'waiting_list',
    });
  });
});

describe('canClaimWaitlistSpot', () => {
  const confirmed = (id: string, gender: string | null = null): ClaimParticipant => ({
    id,
    status: 'confirmed',
    profiles: { gender },
  });
  const me: ClaimParticipant = { id: 'me', status: 'waiting_list', profiles: { gender: 'male' } };

  it('is false for anyone not on the waiting list', () => {
    expect(canClaimWaitlistSpot('classic', 4, [], null)).toBe(false);
    expect(canClaimWaitlistSpot('classic', 4, [], { ...me, status: 'confirmed' })).toBe(false);
  });

  it('needs one free spot on a plain event, stand-by included in the capacity', () => {
    const three = [confirmed('a'), confirmed('b'), confirmed('c')];
    expect(canClaimWaitlistSpot('classic', 4, [...three, me], me)).toBe(true);
    expect(canClaimWaitlistSpot('classic', 4, [...three, confirmed('d'), me], me)).toBe(false);
    expect(canClaimWaitlistSpot('classic', 6, [...three, confirmed('d'), me], me)).toBe(true);
  });

  it('on a mixed event needs room in the viewer\'s own half', () => {
    const men = [confirmed('m1', 'male'), confirmed('m2', 'male')];
    const woman = confirmed('w1', 'female');
    // 4 spots → 2 per gender: both men's spots are taken, one woman's is free.
    expect(canClaimWaitlistSpot('mixed', 4, [...men, woman, me], me)).toBe(false);
    const her: ClaimParticipant = { id: 'her', status: 'waiting_list', profiles: { gender: 'female' } };
    expect(canClaimWaitlistSpot('mixed', 4, [...men, woman, her], her)).toBe(true);
  });

  it('counts guests by their guest gender on a mixed event', () => {
    const guestMan: ClaimParticipant = { id: 'g', status: 'confirmed', guest_gender: 'male', profiles: null };
    expect(canClaimWaitlistSpot('mixed', 4, [confirmed('m1', 'male'), guestMan, me], me)).toBe(false);
  });

  it('refuses a mixed waiter with no gender (the server answers gender_required)', () => {
    const unknown: ClaimParticipant = { id: 'u', status: 'waiting_list', profiles: { gender: null } };
    expect(canClaimWaitlistSpot('mixed', 4, [unknown], unknown)).toBe(false);
  });

  it('on a team event only a waiting pair claims, and it needs two free spots', () => {
    const a: ClaimParticipant = { id: 'a', status: 'waiting_list', pair_participant_id: 'b' };
    const b: ClaimParticipant = { id: 'b', status: 'waiting_list', pair_participant_id: 'a' };
    const two = [confirmed('x'), confirmed('y')];
    expect(canClaimWaitlistSpot('team', 4, [...two, a, b], a)).toBe(true);
    expect(canClaimWaitlistSpot('team', 4, [...two, confirmed('z'), a, b], a)).toBe(false);
    const lone: ClaimParticipant = { id: 'l', status: 'waiting_list', pair_participant_id: null };
    expect(canClaimWaitlistSpot('team', 8, [lone], lone)).toBe(false);
  });
});
