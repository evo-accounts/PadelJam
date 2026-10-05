import { describe, it, expect } from 'vitest';
import { engineRoster } from './mutations';

const row = (participant_id: string, gender: string | null, team: [string, number] | null = null) => ({
  participant_id,
  gender,
  team_id: team?.[0] ?? null,
  team_number: team?.[1] ?? null,
});

describe('engineRoster (migration 0126)', () => {
  it('mixed: men and women in the caller order', () => {
    const rows = [row('w1', 'female'), row('m1', 'male'), row('m2', 'male'), row('w2', 'female')];
    expect(engineRoster('mixed', ['m2', 'w2', 'm1', 'w1'], rows)).toEqual({
      specification: 'mixed',
      men: ['m2', 'm1'],
      women: ['w2', 'w1'],
    });
  });

  it('team: complete pairs by team number, a player without a team is left out', () => {
    const rows = [
      row('a', 'male', ['T2', 2]),
      row('b', 'female', ['T1', 1]),
      row('c', null, ['T2', 2]),
      row('d', 'male', ['T1', 1]),
      row('e', 'male'),
    ];
    expect(engineRoster('team', ['a', 'b', 'c', 'd', 'e'], rows)).toEqual({
      specification: 'team',
      teams: [
        ['b', 'd'],
        ['a', 'c'],
      ],
    });
  });
});
