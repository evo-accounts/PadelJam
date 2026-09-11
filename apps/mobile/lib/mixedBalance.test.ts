import { describe, expect, it } from 'vitest';
import { mixedBalance } from './mixedBalance';

const row = (status: string, gender: string | null, guest = false) => ({
  status,
  guest_gender: guest ? gender : null,
  profiles: guest ? null : { gender },
});

describe('mixedBalance', () => {
  it('counts confirmed players by gender, members and guests alike', () => {
    const r = mixedBalance([
      row('confirmed', 'male'), row('confirmed', 'female'), row('confirmed', 'female', true),
      row('waiting_list', 'male'), row('invited', 'female'),
    ]);
    expect(r).toEqual({ men: 1, women: 2, unknown: 0, balanced: false });
  });
  it('is balanced when counts match and nobody is unknown', () => {
    expect(mixedBalance([row('confirmed', 'male'), row('confirmed', 'female')]).balanced).toBe(true);
  });
  it('treats a missing gender as unknown and unbalanced', () => {
    const r = mixedBalance([row('confirmed', 'male'), row('confirmed', null)]);
    expect(r).toEqual({ men: 1, women: 0, unknown: 1, balanced: false });
  });
  it('an empty roster is balanced (the capacity check reports it, not this one)', () => {
    expect(mixedBalance([]).balanced).toBe(true);
  });
});
