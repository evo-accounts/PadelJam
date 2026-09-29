import { describe, expect, it } from 'vitest';

import { feeOf, filterRows, formatMoney, paymentList, type PaymentParticipant } from './paymentList';

const person = (id: string, over: Partial<PaymentParticipant> = {}): PaymentParticipant => ({
  id,
  user_id: `u-${id}`,
  status: 'confirmed',
  has_paid: false,
  paid_amount: 0,
  guest_name: null,
  profiles: { id: `u-${id}`, full_name: `Player ${id}`, avatar_url: null },
  ...over,
});

const fee5 = { entrance_fee_enabled: true, entrance_fee_amount: 5 };

describe('paymentList', () => {
  it('has no fee when the event has none, or a non-positive amount', () => {
    expect(feeOf({ entrance_fee_enabled: false, entrance_fee_amount: 5 })).toBe(0);
    expect(feeOf({ entrance_fee_enabled: true, entrance_fee_amount: null })).toBe(0);
    expect(feeOf(fee5)).toBe(5);
  });

  it('lists confirmed players only, guests and stand-by included', () => {
    const list = paymentList(fee5, [
      person('a'),
      person('g', { user_id: null, profiles: null, guest_name: 'Guest Gil' }),
      person('w', { status: 'waiting_list' }),
      person('i', { status: 'invited' }),
    ]);
    expect(list.rows.map((r) => r.participantId)).toEqual(['a', 'g']);
    expect(list.rows[1]).toMatchObject({ guest: true, name: 'Guest Gil' });
    expect(list.expected).toBe(10);
  });

  it('a paid player owes nothing and counts the full fee as collected', () => {
    const list = paymentList(fee5, [person('a', { has_paid: true, paid_amount: 5 }), person('b')]);
    expect(list.rows[0]).toMatchObject({ paid: true, owed: 0, partial: false });
    expect(list.rows[1]).toMatchObject({ paid: false, owed: 5, partial: false });
    expect(list.collected).toBe(5);
    expect(list.counts).toEqual({ all: 2, paid: 1, pending: 1 });
  });

  it('after a fee rise, an earlier payer is Pending for the difference only (decision 9)', () => {
    const list = paymentList({ entrance_fee_enabled: true, entrance_fee_amount: 7.5 }, [
      person('a', { has_paid: false, paid_amount: 5 }),
    ]);
    expect(list.rows[0]).toMatchObject({ paid: false, credit: 5, owed: 2.5, partial: true });
    expect(list.collected).toBe(5);
    expect(list.expected).toBe(7.5);
  });

  it('after a fee cut, extra credit never pushes collected past expected', () => {
    const list = paymentList({ entrance_fee_enabled: true, entrance_fee_amount: 3 }, [
      person('a', { has_paid: true, paid_amount: 5 }),
    ]);
    expect(list.collected).toBe(3);
    expect(list.expected).toBe(3);
  });

  it('reads paid_amount sent as a string', () => {
    const list = paymentList(fee5, [person('a', { paid_amount: '2.00' })]);
    expect(list.rows[0]).toMatchObject({ credit: 2, owed: 3, partial: true });
  });

  it('filters by tab', () => {
    const { rows } = paymentList(fee5, [person('a', { has_paid: true, paid_amount: 5 }), person('b')]);
    expect(filterRows(rows, 'all')).toHaveLength(2);
    expect(filterRows(rows, 'paid').map((r) => r.participantId)).toEqual(['a']);
    expect(filterRows(rows, 'pending').map((r) => r.participantId)).toEqual(['b']);
  });

  it('formats money per language', () => {
    expect(formatMoney(5, 'pt-PT')).toBe('5 €');
    expect(formatMoney(2.5, 'pt-BR')).toBe('2,50 €');
    expect(formatMoney(2.5, 'en')).toBe('€2.50');
    expect(formatMoney(30, 'en')).toBe('€30');
  });
});
