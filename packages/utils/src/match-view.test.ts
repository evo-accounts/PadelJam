import { describe, it, expect } from 'vitest';
import { allScored, setupComplete, standingsName } from './match-view';

describe('allScored', () => {
  it('false when empty or any pending', () => {
    expect(allScored([])).toBe(false);
    expect(allScored([{ status: 'played' }, { status: 'pending' }])).toBe(false);
  });
  it('true when all played/not_played', () => {
    expect(allScored([{ status: 'played' }, { status: 'not_played' }])).toBe(true);
  });
});

describe('setupComplete', () => {
  it('individual needs numCourts*4 confirmed', () => {
    expect(setupComplete({ specification: 'classic', confirmedCount: 7, confirmedTeamCount: 0, numCourts: 2 })).toBe(false);
    expect(setupComplete({ specification: 'classic', confirmedCount: 8, confirmedTeamCount: 0, numCourts: 2 })).toBe(true);
  });
  it('team needs numCourts*2 confirmed teams', () => {
    expect(setupComplete({ specification: 'team', confirmedCount: 99, confirmedTeamCount: 3, numCourts: 2 })).toBe(false);
    expect(setupComplete({ specification: 'team', confirmedCount: 0, confirmedTeamCount: 4, numCourts: 2 })).toBe(true);
  });
});

describe('standingsName', () => {
  const tl = (n: number) => `Team ${n}`;
  it('resolves participant + team names', () => {
    expect(standingsName({ entity_id: 'p1', is_team: false }, { p1: 'Ana' }, {}, tl)).toBe('Ana');
    expect(standingsName({ entity_id: 't1', is_team: true }, {}, { t1: 3 }, tl)).toBe('Team 3');
    expect(standingsName({ entity_id: 'x', is_team: false }, {}, {}, tl)).toBe('—');
  });
});
