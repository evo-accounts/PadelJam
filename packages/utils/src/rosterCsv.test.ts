import { describe, expect, it } from 'vitest';
import { buildRosterCsv, rosterCsvFilename, type CsvParticipant } from './rosterCsv';

const member: CsvParticipant = {
  user_id: 'u1', guest_name: null, status: 'confirmed', is_standby: false,
  joined_at: '2026-06-01T10:00:00Z', confirmed_at: '2026-06-01T11:00:00Z',
  has_paid: true, paid_at: '2026-06-01T12:00:00Z', profiles: { full_name: 'Ana, Silva' },
};
const guest: CsvParticipant = {
  user_id: null, guest_name: 'Bob "B"', status: 'invited', is_standby: true,
  joined_at: '2026-06-02T10:00:00Z', confirmed_at: null,
  has_paid: false, paid_at: null, profiles: null,
};

describe('buildRosterCsv', () => {
  it('emits the header then one row per participant', () => {
    const csv = buildRosterCsv([member], { entrance_fee_enabled: true, entrance_fee_amount: 5 });
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount');
    expect(lines).toHaveLength(2);
  });
  it('derives user_type and fee, and escapes commas/quotes', () => {
    const csv = buildRosterCsv([member, guest], { entrance_fee_enabled: true, entrance_fee_amount: 5 });
    const rows = csv.trim().split('\n');
    expect(rows[1]).toContain('"Ana, Silva",member,confirmed,false,');
    expect(rows[1]).toContain(',true,2026-06-01T12:00:00Z,5');
    expect(rows[2]).toContain('"Bob ""B""",manual,invited,true,');
    expect(rows[2]).toContain(',false,,5');
  });
  it('uses fee 0 when the event has no entrance fee', () => {
    const csv = buildRosterCsv([member], { entrance_fee_enabled: false, entrance_fee_amount: null });
    expect(csv.trim().split('\n')[1]!.endsWith(',0')).toBe(true);
  });
});

describe('rosterCsvFilename', () => {
  it('slugifies the event name with the date', () => {
    expect(rosterCsvFilename('Friday Night Padel!', '2026-06-17')).toBe('friday-night-padel-2026-06-17.csv');
  });
});
