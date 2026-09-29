import { describe, expect, it } from 'vitest';
import { pendingActions, teamsIncomplete } from './pendingActions';

const base = {
  eventId: 'e1',
  specification: 'classic',
  openSpots: 0,
  teamsIncomplete: false,
  feeEnabled: false,
  unpaid: 0,
  hasLocation: true,
  courtsReserved: true,
};

describe('pendingActions', () => {
  it('is empty when nothing is pending', () => {
    expect(pendingActions(base)).toEqual([]);
  });

  it('lists open spots and a missing location, in the audit order', () => {
    expect(pendingActions({ ...base, openSpots: 3, hasLocation: false })).toEqual([
      { key: 'spots', count: 3, href: '/event/e1/manage-players' },
      { key: 'location', count: 0, href: '/event/e1/manage?sheet=location' },
    ]);
  });

  it('asks for teams only on a team event', () => {
    expect(pendingActions({ ...base, teamsIncomplete: true })).toEqual([]);
    expect(pendingActions({ ...base, specification: 'team', teamsIncomplete: true })).toEqual([
      { key: 'teams', count: 0, href: '/event/e1/manage-players?view=teams' },
    ]);
  });

  it('asks for payments only on a fee event', () => {
    expect(pendingActions({ ...base, unpaid: 2 })).toEqual([]);
    expect(pendingActions({ ...base, feeEnabled: true, unpaid: 2 })).toEqual([
      { key: 'payments', count: 2, href: '/event/e1/payments' },
    ]);
  });

  it('flags unreserved courts only once a location is set', () => {
    expect(pendingActions({ ...base, courtsReserved: false })).toEqual([
      { key: 'courts', count: 0, href: '/event/e1/manage?sheet=location' },
    ]);
    expect(pendingActions({ ...base, hasLocation: false, courtsReserved: false }).map((a) => a.key)).toEqual([
      'location',
    ]);
  });
});

describe('teamsIncomplete', () => {
  const team = (a: string | null, b: string | null, confirmed = true) => ({
    is_confirmed: confirmed,
    player_a: a ? { id: a } : null,
    player_b: b ? { id: b } : null,
  });

  it('is false when every confirmed player is in a complete team', () => {
    expect(teamsIncomplete(['p1', 'p2'], [team('p1', 'p2')])).toBe(false);
    expect(teamsIncomplete([], [])).toBe(false);
  });

  it('is true for a half team or an unconfirmed one', () => {
    expect(teamsIncomplete(['p1'], [team('p1', null)])).toBe(true);
    expect(teamsIncomplete(['p1', 'p2'], [team('p1', 'p2', false)])).toBe(true);
    expect(teamsIncomplete(['p1', 'p2', 'p3'], [team('p1', 'p2')])).toBe(true);
  });
});
