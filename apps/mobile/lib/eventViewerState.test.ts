import { describe, expect, it } from 'vitest';

import { bannerState, bottomState, canLeave, type ViewerInput } from './eventViewerState';

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

  it('shows nothing to an outsider or on a cancelled event', () => {
    expect(bannerState('scheduled', null)).toBeNull();
    expect(bannerState('cancelled', { status: 'confirmed', is_standby: false })).toBeNull();
  });
});

describe('canLeave', () => {
  it('is offered to a confirmed or interested player on a scheduled event', () => {
    expect(canLeave('scheduled', { status: 'confirmed' }, false, false)).toBe(true);
    expect(canLeave('scheduled', { status: 'interested' }, false, false)).toBe(true);
  });

  it('stays offered to a player past the deadline — it opens the contact-the-organizer sheet', () => {
    expect(canLeave('scheduled', { status: 'confirmed' }, false, true)).toBe(true);
  });

  it('is not offered to a waiting player, an outsider, or once the event runs', () => {
    expect(canLeave('scheduled', { status: 'waiting_list' }, false, false)).toBe(false);
    expect(canLeave('scheduled', null, false, false)).toBe(false);
    expect(canLeave('in_progress', { status: 'confirmed' }, false, false)).toBe(false);
  });

  it('is withdrawn from a playing organizer past the deadline', () => {
    expect(canLeave('scheduled', { status: 'confirmed' }, true, false)).toBe(true);
    expect(canLeave('scheduled', { status: 'confirmed' }, true, true)).toBe(false);
  });
});
