export interface CsvParticipant {
  user_id: string | null;
  guest_name: string | null;
  status: string;
  is_standby: boolean;
  joined_at: string;
  confirmed_at: string | null;
  has_paid: boolean;
  paid_at: string | null;
  profiles: { full_name: string | null } | null;
}
export interface CsvEvent {
  entrance_fee_enabled: boolean;
  entrance_fee_amount: number | null;
}

const HEADER = 'name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount';

/** Quote a field if it contains a comma, double-quote, or newline; double internal quotes. */
function esc(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Build the attendance/revenue CSV (JM-47). Member email/mobile are intentionally excluded. */
export function buildRosterCsv(participants: CsvParticipant[], event: CsvEvent): string {
  const fee = event.entrance_fee_enabled ? (event.entrance_fee_amount ?? 0) : 0;
  const rows = participants.map((p) => {
    const name = p.profiles?.full_name ?? p.guest_name ?? '';
    const userType = p.user_id ? 'member' : 'manual';
    return [
      esc(name),
      userType,
      p.status,
      String(p.is_standby),
      p.joined_at ?? '',
      p.confirmed_at ?? '',
      String(p.has_paid),
      p.paid_at ?? '',
      String(fee),
    ].join(',');
  });
  return [HEADER, ...rows].join('\n');
}

/** "{slug}-{yyyy-MM-dd}.csv" from an event name + ISO date string (YYYY-MM-DD). */
export function rosterCsvFilename(eventName: string, isoDate: string): string {
  const slug = eventName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
  return `${slug}-${isoDate}.csv`;
}
