/**
 * The Payment list's numbers (UX-MEVT-16, decision 9) — pure, so the page and the dashboard's Paid
 * donut read the same thing.
 *
 * Who is listed: every CONFIRMED participant, guests included (they take a spot, so they owe the
 * fee). mark_all_paid touches confirmed rows only (0121), so the list and the bulk action agree.
 *
 * Money: `paid_amount` is the credit a player holds (0122). "Paid" is the server's `has_paid`
 * (paid_amount covers the current fee). After a fee rise an earlier payer is Pending again and owes
 * only the difference — `owed` below. The Total card counts at most the fee per player, so a fee
 * cut never shows more than 100% collected.
 */

export type PaymentFilter = 'all' | 'paid' | 'pending';

/** The fields of an `event_participants` row this list reads (`paid_amount` comes with `*`). */
export interface PaymentParticipant {
  id: string;
  status: string;
  has_paid: boolean;
  paid_amount?: number | string | null;
  guest_name: string | null;
  user_id: string | null;
  profiles: { full_name?: string | null; avatar_url?: string | null } | null;
}

export interface PaymentRow {
  id: string;
  name: string | null;
  avatarPath: string | null;
  guest: boolean;
  paid: boolean;
  /** What the player still owes; 0 when paid. Equal to the fee unless partially credited. */
  owed: number;
  /** True for a Pending player holding some credit (after a fee rise). */
  partial: boolean;
}

export interface PaymentSummary {
  fee: number;
  rows: PaymentRow[];
  paidCount: number;
  pendingCount: number;
  collected: number;
  expected: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function paymentSummary(
  event: { entrance_fee_enabled: boolean; entrance_fee_amount: number | null },
  participants: PaymentParticipant[],
): PaymentSummary {
  const fee = event.entrance_fee_enabled ? num(event.entrance_fee_amount) : 0;
  const rows: PaymentRow[] = participants
    .filter((p) => p.status === 'confirmed')
    .map((p) => {
      const credit = num(p.paid_amount);
      const paid = p.has_paid;
      const owed = paid ? 0 : round2(Math.max(fee - credit, 0));
      return {
        id: p.id,
        name: p.profiles?.full_name ?? p.guest_name ?? null,
        avatarPath: p.profiles?.avatar_url ?? null,
        guest: p.user_id == null,
        paid,
        owed,
        partial: !paid && credit > 0 && owed > 0,
      };
    });
  const collected = round2(
    participants
      .filter((p) => p.status === 'confirmed')
      .reduce((sum, p) => sum + (p.has_paid ? fee : Math.min(num(p.paid_amount), fee)), 0),
  );
  const paidCount = rows.filter((r) => r.paid).length;
  return {
    fee,
    rows,
    paidCount,
    pendingCount: rows.length - paidCount,
    collected,
    expected: round2(fee * rows.length),
  };
}

export const filterPaymentRows = (rows: PaymentRow[], f: PaymentFilter) =>
  f === 'all' ? rows : rows.filter((r) => (f === 'paid' ? r.paid : !r.paid));

/** Euros in the viewer's locale ("12,50 €" / "€12.50"). Events carry no currency: PadelJam is EUR. */
export function formatMoney(amount: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount);
  } catch {
    return `${amount.toFixed(2)} €`;
  }
}
