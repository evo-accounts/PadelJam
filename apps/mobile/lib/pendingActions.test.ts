import { describe, expect, it } from 'vitest';
import { pendingActions } from './pendingActions';

const base = {
  eventId: 'e1',
  specification: 'classic',
  numCourts: 1,
  confirmedCount: 4,
  confirmedTeamCount: 0,
  hasLocation: true,
};

describe('pendingActions', () => {
  it('is empty for a fully set up classic event', () => {
    expect(pendingActions(base)).toEqual([]);
  });

  it('asks for the missing players and a location (the audit E4 shape)', () => {
    expect(pendingActions({ ...base, confirmedCount: 0, hasLocation: false })).toEqual([
      { key: 'addPlayers', count: 4, href: '/event/e1/manage-players' },
      { key: 'setLocation', count: 0, href: '/event/e1/manage?sheet=location' },
    ]);
  });

  it('asks for teams on a team event', () => {
    expect(pendingActions({ ...base, specification: 'team', confirmedTeamCount: 1 })).toEqual([
      { key: 'setUpTeams', count: 1, href: '/event/e1/manage-players' },
    ]);
  });

  it('lists players, then teams, then location when all are missing', () => {
    expect(
      pendingActions({ ...base, specification: 'team', confirmedCount: 2, confirmedTeamCount: 0, hasLocation: false })
    ).toEqual([
      { key: 'addPlayers', count: 2, href: '/event/e1/manage-players' },
      { key: 'setUpTeams', count: 2, href: '/event/e1/manage-players' },
      { key: 'setLocation', count: 0, href: '/event/e1/manage?sheet=location' },
    ]);
  });

  it('never reports a negative player count', () => {
    expect(pendingActions({ ...base, confirmedCount: 9 })).toEqual([]);
  });
});
